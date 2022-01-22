import * as anchor from "@project-serum/anchor";
import { TOKEN_PROGRAM_ID, Token } from "@solana/spl-token";
import { SendTransactionError } from "@solana/web3.js";
import { times } from "ramda";

import * as chai from "chai";
import * as chaiAsPromised from "chai-as-promised";
import * as chaiBn from "chai-bn";
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

  const mintAccountKeypair = anchor.web3.Keypair.generate();

  const initializerKeypair = anchor.web3.Keypair.generate();

  let salaryVaultAccountPDA: anchor.web3.PublicKey;
  let salaryProgramSharedStatePDA: anchor.web3.PublicKey;
  let salaryVaultAuthorityPDA: anchor.web3.PublicKey;

  let employee1SalaryStatePDABump: number;
  let employee2SalaryStatePDABump: number;

  let salaryVaultAccountPDABump: number;
  let salaryProgramSharedStatePDABump: number;
  let salaryVaultAuthorityPDABump: number;

  let employee1Keypair: anchor.web3.Keypair;
  let employee2Keypair: anchor.web3.Keypair;

  let employee1SalaryStatePDA: anchor.web3.PublicKey;
  let employee2SalaryStatePDA: anchor.web3.PublicKey;

  let employee1TokenAccount: anchor.web3.PublicKey;
  let employee2TokenAccount: anchor.web3.PublicKey;

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
    [employee1Keypair, employee2Keypair] = times(
      anchor.web3.Keypair.generate,
      2
    );

    [
      [employee1SalaryStatePDA, employee1SalaryStatePDABump],
      [employee2SalaryStatePDA, employee2SalaryStatePDABump],
    ] = await Promise.all(
      [employee1Keypair, employee2Keypair].map((keypair) =>
        findEmployeeSalaryStateAddress(keypair)
      )
    );

    [employee1TokenAccount, employee2TokenAccount] = await Promise.all(
      [employee1Keypair, employee2Keypair]
        .map((keypair) => keypair.publicKey)
        .map((publicKey) => mintAccount.createAccount(publicKey))
    );
  }

  before(async () => {
    const provider = anchor.getProvider();

    await provider.connection.confirmTransaction(
      await provider.connection.requestAirdrop(
        initializerKeypair.publicKey,
        10_000_000_000
      ),
      "confirmed"
    );

    mintAccount = await Token.createMint(
      provider.connection,
      initializerKeypair,
      mintAccountKeypair.publicKey,
      null,
      0,
      TOKEN_PROGRAM_ID
    );

    await initAllPdaAddresses();
    await initAllEmployeeAccounts();

    // console.log(`program: \n  ${program.programId.toString()}`);
    // console.log(`salaryVaultAccountPDA: \n  ${salaryVaultAccountPDA.toString()}`);
    // console.log(`salaryProgramSharedStatePDA: \n  ${salaryProgramSharedStatePDA.toString()}`);
    // console.log(`salaryVaultAuthorityPDA: \n  ${salaryVaultAuthorityPDA.toString()}`);
    // console.log(`employee1Keypair.pubkey: \n  ${employee1Keypair.publicKey.toString()}`);
    // console.log(`employee2Keypair.pubkey: \n  ${employee2Keypair.publicKey.toString()}`);
    // console.log(`employee1Keypair.secretkey: \n  ${employee1Keypair.secretKey.toString()}`);
    // console.log(`employee2Keypair.secretkey: \n  ${employee2Keypair.secretKey.toString()}`);
    // console.log(`employee1SalaryStatePDA: \n  ${employee1SalaryStatePDA.toString()}`);
    // console.log(`employee2SalaryStatePDA: \n  ${employee2SalaryStatePDA.toString()}`);
    // console.log(`employee1TokenAccount: \n  ${employee1TokenAccount.toString()}`);
    // console.log(`employee2TokenAccount: \n  ${employee2TokenAccount.toString()}`);
  });

  describe("#initialize", () => {
    it("should be successful", async () => {
      return program.rpc.initialize(
        salaryVaultAccountPDABump,
        salaryProgramSharedStatePDABump,
        {
          signers: [initializerKeypair],
          accounts: {
            initializer: initializerKeypair.publicKey,
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
            signers: [initializerKeypair],
            accounts: {
              initializer: initializerKeypair.publicKey,
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
      it("should be successful", async () => {
        return program.rpc.addEmployee(
          oneTokenPerSecDailyRate,
          employee1SalaryStatePDABump,
          {
            signers: [initializerKeypair],
            accounts: {
              adder: initializerKeypair.publicKey,
              salaryProgramSharedState: salaryProgramSharedStatePDA,
              employeeSalaryState: employee1SalaryStatePDA,
              employeeTokenAccount: employee1TokenAccount,
              employee: employee1Keypair.publicKey,
              systemProgram: anchor.web3.SystemProgram.programId,
              rent: anchor.web3.SYSVAR_RENT_PUBKEY,
            },
          }
        ).should.eventually.fulfilled;
      });

      it("should have employee daily rate as expected", async () => {
        let employee1SalaryStateAccount =
          await program.account.employeeSalaryState.fetch(
            employee1SalaryStatePDA
          );

        const dailyRate: anchor.BN = employee1SalaryStateAccount.dailyRate;

        dailyRate.should.be.a.bignumber.that.equals(oneTokenPerSecDailyRate);
      });
    });
  });
});
