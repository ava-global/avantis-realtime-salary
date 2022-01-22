import * as anchor from "@project-serum/anchor";
import { TOKEN_PROGRAM_ID, Token } from "@solana/spl-token";
import { SendTransactionError } from "@solana/web3.js";

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
  const employee1Keypair = anchor.web3.Keypair.generate();
  const employee2Keypair = anchor.web3.Keypair.generate();

  let salaryVaultAccountPDA: anchor.web3.PublicKey;
  let programSharedStatePDA: anchor.web3.PublicKey;
  let salaryVaultAuthorityPDA: anchor.web3.PublicKey;

  let salaryVaultAccountPDABump: number;
  let salaryProgramSharedStatePDABump: number;
  let salaryVaultAuthorityPDABump: number;

  let mintAccount: Token

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

  before(async () => {
    const provider = anchor.getProvider();

    await provider.connection.confirmTransaction(
      await provider.connection.requestAirdrop(
        initializerKeypair.publicKey,
        10_000_000_000
      ),
      "confirmed"
    );

    [
      [salaryVaultAccountPDA, salaryVaultAccountPDABump],
      [programSharedStatePDA, salaryProgramSharedStatePDABump],
      [salaryVaultAuthorityPDA, salaryVaultAuthorityPDABump],
    ] = await Promise.all([
      pdaSeed.SALARY_VAULT_ACCOUNT,
      pdaSeed.SALARY_SHARED_STATE_ACCOUNT,
      pdaSeed.SALARY_VAULT_AUTHORITY_ACCOUNT,
    ].map(findPdaAddress));

    mintAccount = await Token.createMint(
      anchor.getProvider().connection,
      initializerKeypair,
      mintAccountKeypair.publicKey,
      null,
      0,
      TOKEN_PROGRAM_ID
    );
  })

  describe("#initialize", () => {
    before(async () => {
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
      );
    });

    it("should let the program own the salary vault", async () => {
      let salaryVault = await mintAccount.getAccountInfo(salaryVaultAccountPDA);
  
      salaryVault.owner.should.deep.equals(salaryVaultAuthorityPDA);
    });

    it("can't be initialize again", async () => {
      program.rpc.initialize(
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
      ).should.to.be.rejectedWith(SendTransactionError);
    });
  })
});
