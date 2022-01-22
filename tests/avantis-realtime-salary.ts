import * as anchor from "@project-serum/anchor";
import { TOKEN_PROGRAM_ID, Token } from "@solana/spl-token";
import { SendTransactionError } from "@solana/web3.js";
import { times } from "ramda";

import * as chai from "chai";
import chaiAsPromised from "chai-as-promised";
import chaiBn from "chai-bn";
import { Duration } from "luxon";

function setUpTestRunner() {
  chai.should();
  chai.use(chaiAsPromised);
  chai.use(chaiBn(anchor.BN));
}

setUpTestRunner();

const pdaSeed = {
  SALARY_VAULT_ACCOUNT: "salary_vault_account",
  SALARY_SHARED_STATE_ACCOUNT: "salary_shared_state_account",
  SALARY_VAULT_AUTHORITY_ACCOUNT: "salary_vault_authority",
};

describe("avantis-realtime-salary", () => {
  anchor.setProvider(anchor.Provider.local());

  const program: anchor.Program = anchor.workspace.AvantisRealtimeSalary;

  let mintAccountKeypair: anchor.web3.Keypair;

  let employerKeypair: anchor.web3.Keypair;
  let employerTokenAccount: anchor.web3.PublicKey;

  let employeeKeypair: anchor.web3.Keypair;
  let employeeTokenAccount: anchor.web3.PublicKey;

  let unknownPersonKeypair: anchor.web3.Keypair;
  let unknownPersonTokenAccount: anchor.web3.PublicKey;

  let employeeSalaryStatePDA: anchor.web3.PublicKey;
  let unknownPersonSalaryStatePDA: anchor.web3.PublicKey;

  let salaryVaultAccountPDA: anchor.web3.PublicKey;
  let salaryProgramSharedStatePDA: anchor.web3.PublicKey;
  let salaryVaultAuthorityPDA: anchor.web3.PublicKey;

  let employeeSalaryStatePDABump: number;
  let unknownPersonSalaryStatePDABump: number;

  let salaryVaultAccountPDABump: number;
  let salaryProgramSharedStatePDABump: number;
  let salaryVaultAuthorityPDABump: number;

  let mintAccount: Token;

  async function findPdaAddress(seed: string) {
    return anchor.web3.PublicKey.findProgramAddress(
      [anchor.utils.bytes.utf8.encode(seed)],
      program.programId
    );
  }

  async function findEmployeeSalaryStateAddress(keypair: anchor.web3.Keypair) {
    return anchor.web3.PublicKey.findProgramAddress(
      [keypair.publicKey.toBuffer()],
      program.programId
    );
  }

  async function initAllPdaAddresses() {
    [
      [salaryVaultAccountPDA, salaryVaultAccountPDABump],
      [salaryProgramSharedStatePDA, salaryProgramSharedStatePDABump],
      [salaryVaultAuthorityPDA, salaryVaultAuthorityPDABump],
    ] = await Promise.all(
      [
        pdaSeed.SALARY_VAULT_ACCOUNT,
        pdaSeed.SALARY_SHARED_STATE_ACCOUNT,
        pdaSeed.SALARY_VAULT_AUTHORITY_ACCOUNT,
      ].map((seed) => findPdaAddress(seed))
    );
  }

  async function initAllEmployeeAccounts() {
    [
      [employeeSalaryStatePDA, employeeSalaryStatePDABump],
      [unknownPersonSalaryStatePDA, unknownPersonSalaryStatePDABump],
    ] = await Promise.all(
      [employeeKeypair, unknownPersonKeypair].map((keypair) =>
        findEmployeeSalaryStateAddress(keypair)
      )
    );
  }

  async function initAllKeypairs() {
    [
      employerKeypair,
      employeeKeypair,
      unknownPersonKeypair,
      mintAccountKeypair,
    ] = times(anchor.web3.Keypair.generate, 4);
  }

  async function initAllTokenAccounts() {
    [employerTokenAccount, employeeTokenAccount, unknownPersonTokenAccount] =
      await Promise.all(
        [employerKeypair, employeeKeypair, unknownPersonKeypair]
          .map((keypair) => keypair.publicKey)
          .map((publicKey) => mintAccount.createAccount(publicKey))
      );
  }

  async function sleep(ms: number) {
    console.log("Sleeping for", ms / 1000, "seconds");
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  describe("#initialize", () => {
    before(async () => {
      await initAllKeypairs();

      const provider = anchor.getProvider();

      await provider.connection.confirmTransaction(
        await provider.connection.requestAirdrop(
          employerKeypair.publicKey,
          10_000_000_000
        ),
        "confirmed"
      );

      mintAccount = await Token.createMint(
        provider.connection,
        employerKeypair,
        mintAccountKeypair.publicKey,
        null,
        0,
        TOKEN_PROGRAM_ID
      );

      await initAllTokenAccounts();

      await initAllPdaAddresses();
      await initAllEmployeeAccounts();
    });

    it("should succeed", async () => {
      return program.rpc.initialize(
        salaryVaultAccountPDABump,
        salaryProgramSharedStatePDABump,
        {
          signers: [employerKeypair],
          accounts: {
            initializer: employerKeypair.publicKey,
            salaryProgramSharedState: salaryProgramSharedStatePDA,
            vaultAccount: salaryVaultAccountPDA,
            tokenProgram: TOKEN_PROGRAM_ID,
            systemProgram: anchor.web3.SystemProgram.programId,
            rent: anchor.web3.SYSVAR_RENT_PUBKEY,
            mint: mintAccount.publicKey,
          },
        }
      ).should.be.fulfilled;
    });

    it("should let the program own the salary vault", async () => {
      let salaryVault = await mintAccount.getAccountInfo(salaryVaultAccountPDA);

      salaryVault.owner.should.deep.equal(salaryVaultAuthorityPDA);
    });

    it("should fail if being called again", async () => {
      return program.rpc
        .initialize(
          salaryVaultAccountPDABump,
          salaryProgramSharedStatePDABump,
          {
            signers: [employerKeypair],
            accounts: {
              initializer: employerKeypair.publicKey,
              salaryProgramSharedState: salaryProgramSharedStatePDA,
              vaultAccount: salaryVaultAccountPDA,
              tokenProgram: TOKEN_PROGRAM_ID,
              systemProgram: anchor.web3.SystemProgram.programId,
              rent: anchor.web3.SYSVAR_RENT_PUBKEY,
              mint: mintAccount.publicKey,
            },
          }
        )
        .should.be.rejectedWith(SendTransactionError);
    });
  });

  describe("#addEmployee", () => {
    const secInDay = Duration.fromObject({ day: 1 }).as("second");
    const oneTokenPerSecDailyRate: anchor.BN = new anchor.BN(1 * secInDay);

    describe("when add from employer", () => {
      it("should succeed", async () => {
        return program.rpc.addEmployee(
          oneTokenPerSecDailyRate,
          employeeSalaryStatePDABump,
          {
            signers: [employerKeypair],
            accounts: {
              adder: employerKeypair.publicKey,
              salaryProgramSharedState: salaryProgramSharedStatePDA,
              employeeSalaryState: employeeSalaryStatePDA,
              employeeTokenAccount: employeeTokenAccount,
              employee: employeeKeypair.publicKey,
              systemProgram: anchor.web3.SystemProgram.programId,
              rent: anchor.web3.SYSVAR_RENT_PUBKEY,
            },
          }
        ).should.be.fulfilled;
      });

      it("should have employee daily rate as expected", async () => {
        let employee1SalaryStateAccount =
          await program.account.employeeSalaryState.fetch(
            employeeSalaryStatePDA
          );

        const dailyRate: anchor.BN = employee1SalaryStateAccount.dailyRate;

        dailyRate.should.be.a.bignumber.that.equals(oneTokenPerSecDailyRate);
      });
    });

    describe("when add from someone else", () => {
      it("should fail", async () => {
        return program.rpc
          .addEmployee(
            oneTokenPerSecDailyRate,
            unknownPersonSalaryStatePDABump,
            {
              signers: [employeeKeypair],
              accounts: {
                adder: employeeKeypair.publicKey,
                salaryProgramSharedState: salaryProgramSharedStatePDA,
                employeeSalaryState: unknownPersonSalaryStatePDA,
                employeeTokenAccount: unknownPersonTokenAccount,
                employee: unknownPersonKeypair.publicKey,
                systemProgram: anchor.web3.SystemProgram.programId,
                rent: anchor.web3.SYSVAR_RENT_PUBKEY,
              },
            }
          )
          .should.be.rejectedWith(SendTransactionError);
      });
    });
  });

  describe("#depositToVault", () => {
    describe("when deposit from anyone", () => {
      let depositorKeypair: anchor.web3.Keypair;
      let depositorTokenAccount: anchor.web3.PublicKey;
      let initialVaultTokenCount: anchor.BN;
      const depositAmount = 1000;

      before(async () => {
        depositorKeypair = unknownPersonKeypair;
        depositorTokenAccount = unknownPersonTokenAccount;

        await mintAccount.mintTo(
          depositorTokenAccount,
          mintAccountKeypair.publicKey,
          [mintAccountKeypair],
          1_000_000
        );

        initialVaultTokenCount = (
          await mintAccount.getAccountInfo(salaryVaultAccountPDA)
        ).amount;
      });

      it("should succeed", async () => {
        return program.rpc.depositToVault(new anchor.BN(depositAmount), {
          signers: [depositorKeypair],
          accounts: {
            depositor: depositorKeypair.publicKey,
            vaultAccount: salaryVaultAccountPDA,
            depositorTokenAccount: depositorTokenAccount,
            tokenProgram: TOKEN_PROGRAM_ID,
          },
        }).should.be.fulfilled;
      });

      it("should increase the vault amount by the deposit amount", async () => {
        const finalVaultTokenCount: anchor.BN = (
          await mintAccount.getAccountInfo(salaryVaultAccountPDA)
        ).amount;

        initialVaultTokenCount
          .addn(depositAmount)
          .should.be.a.bignumber.that.equals(finalVaultTokenCount);
      });
    });
  });

  describe("#claimSalary", () => {
    describe("when claim from employee", () => {
      let claimerKeypair: anchor.web3.Keypair;
      let claimerTokenAccount: anchor.web3.PublicKey;
      let claimerSalaryStatePDA: anchor.web3.PublicKey;

      let initialVaultTokenCount: anchor.BN;
      let initialClaimerTokenCount: anchor.BN;

      before(async () => {
        claimerKeypair = employeeKeypair;
        claimerTokenAccount = employeeTokenAccount;
        claimerSalaryStatePDA = employeeSalaryStatePDA;

        initialVaultTokenCount = (
          await mintAccount.getAccountInfo(salaryVaultAccountPDA)
        ).amount;

        initialClaimerTokenCount = (
          await mintAccount.getAccountInfo(employeeTokenAccount)
        ).amount;

        //sleep for 5 seconds to wait for claimable amount
        await sleep(5000);
      });

      it("should succeed", async () => {
        return program.rpc.claimSalary({
          signers: [claimerKeypair],
          accounts: {
            claimer: claimerKeypair.publicKey,
            salaryProgramSharedState: salaryProgramSharedStatePDA,
            employeeTokenAccount: claimerTokenAccount,
            vaultAccount: salaryVaultAccountPDA,
            employeeSalaryState: claimerSalaryStatePDA,
            vaultAuthority: salaryVaultAuthorityPDA,
            tokenProgram: TOKEN_PROGRAM_ID,
          },
        }).should.be.fulfilled;
      });

      it("should give token to the claimer for an expectable amount", async () => {
        const finalClaimerTokenCount = (
          await mintAccount.getAccountInfo(employeeTokenAccount)
        ).amount;

        let claimedAmount = finalClaimerTokenCount.sub(
          initialClaimerTokenCount
        );

        // we expect >5 token because total daily rate is 24 * 60 * 60 = 1 token per seconds
        // we slept for 5 seconds, so total claimed should > 5
        claimedAmount.should.be.a.bignumber.greaterThan("5");

        // but anyway we expect that it should not more than 10
        claimedAmount.should.be.a.bignumber.lessThan("10");
      });

      it("should subtract token from the vault equal to the claimed amount", async () => {
        const finalClaimerTokenCount: anchor.BN = (
          await mintAccount.getAccountInfo(employeeTokenAccount)
        ).amount;

        let claimedAmount = finalClaimerTokenCount.sub(
          initialClaimerTokenCount
        );

        const finalVaultTokenCount: anchor.BN = (
          await mintAccount.getAccountInfo(salaryVaultAccountPDA)
        ).amount;

        let subtractedAmount = initialVaultTokenCount.sub(finalVaultTokenCount);

        claimedAmount.should.be.a.bignumber.that.equals(subtractedAmount);
      });
    });

    describe("when claim from someone else", () => {
      let claimerKeypair: anchor.web3.Keypair;
      let claimerTokenAccount: anchor.web3.PublicKey;
      let claimerSalaryStatePDA: anchor.web3.PublicKey;

      before(async () => {
        claimerKeypair = unknownPersonKeypair;
        claimerTokenAccount = unknownPersonTokenAccount;
        claimerSalaryStatePDA = unknownPersonSalaryStatePDA;

        //sleep for 5 seconds to wait for claimable amount
        await sleep(5000);
      });

      it("should fail", async () => {
        return program.rpc
          .claimSalary({
            signers: [claimerKeypair],
            accounts: {
              claimer: claimerKeypair.publicKey,
              salaryProgramSharedState: salaryProgramSharedStatePDA,
              employeeTokenAccount: claimerTokenAccount,
              vaultAccount: salaryVaultAccountPDA,
              employeeSalaryState: claimerSalaryStatePDA,
              vaultAuthority: salaryVaultAuthorityPDA,
              tokenProgram: TOKEN_PROGRAM_ID,
            },
          })
          .should.be.rejectedWith(
            "The given account is not owned by the executing program"
          );
      });
    });
  });
});
