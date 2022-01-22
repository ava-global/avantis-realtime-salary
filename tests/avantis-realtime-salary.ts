import * as anchor from "@project-serum/anchor";
import { TOKEN_PROGRAM_ID, Token } from "@solana/spl-token";
import { SendTransactionError } from "@solana/web3.js";
import { times } from "ramda";

import * as chai from "chai";
import * as chaiAsPromised from "chai-as-promised";

function setUpTestRunner() {
  chai.should();
  chai.use(chaiAsPromised);
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
  let programSharedStatePDA: anchor.web3.PublicKey;
  let salaryVaultAuthorityPDA: anchor.web3.PublicKey;

  let employee1StatePDABump: number;
  let employee2StatePDABump: number;

  let salaryVaultAccountPDABump: number;
  let salaryProgramSharedStatePDABump: number;
  let salaryVaultAuthorityPDABump: number;

  let employee1Keypair: anchor.web3.Keypair;
  let employee2Keypair: anchor.web3.Keypair;

  let employee1StatePDA: anchor.web3.PublicKey;
  let employee2StatePDA: anchor.web3.PublicKey;

  let employee1TokenAccount: anchor.web3.PublicKey;
  let employee2TokenAccount: anchor.web3.PublicKey;

  let mintAccount: Token;

  async function findPdaAddress(seed: string) {
    return anchor.web3.PublicKey.findProgramAddress(
      [anchor.utils.bytes.utf8.encode(seed)],
      program.programId
    );
  }

  async function findAccountAddress(keypair: anchor.web3.Keypair) {
    return anchor.web3.PublicKey.findProgramAddress(
      [employee1Keypair.publicKey.toBuffer()],
      program.programId
    );
  }

  async function initAllPdaAddresses() {
    [
      [salaryVaultAccountPDA, salaryVaultAccountPDABump],
      [programSharedStatePDA, salaryProgramSharedStatePDABump],
      [salaryVaultAuthorityPDA, salaryVaultAuthorityPDABump],
    ] = await Promise.all(
      [
        pdaSeed.SALARY_VAULT_ACCOUNT,
        pdaSeed.SALARY_SHARED_STATE_ACCOUNT,
        pdaSeed.SALARY_VAULT_AUTHORITY_ACCOUNT,
      ].map(findPdaAddress)
    );
  }

  async function initAllEmployeeAccounts() {
    [employee1Keypair, employee2Keypair] = times(
      anchor.web3.Keypair.generate,
      2
    );

    [
      [employee1StatePDA, employee1StatePDABump],
      [employee2StatePDA, employee2StatePDABump],
    ] = await Promise.all(
      [employee1Keypair, employee2Keypair].map(findAccountAddress)
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
  });

  describe("#initialize", () => {
    it("should be successful", async () => {
      await program.rpc.initialize(
        salaryVaultAccountPDABump,
        salaryProgramSharedStatePDABump,
        {
          signers: [initializerKeypair],
          accounts: {
            initializer: initializerKeypair.publicKey,
            salaryProgramSharedState: programSharedStatePDA,
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

      salaryVault.owner.should.deep.equals(salaryVaultAuthorityPDA);
    });

    it("should fail if being called again", async () => {
      program.rpc
        .initialize(
          salaryVaultAccountPDABump,
          salaryProgramSharedStatePDABump,
          {
            signers: [initializerKeypair],
            accounts: {
              initializer: initializerKeypair.publicKey,
              salaryProgramSharedState: programSharedStatePDA,
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

  // describe("#addEmployee", () => {
  //   describe("when add from employer", () => {
  //     it("should be successful", async () => {});
  //   });
  // });
});
