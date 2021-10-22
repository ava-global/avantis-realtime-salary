const anchor = require('@project-serum/anchor');

const { PublicKey, Transaction, SystemProgram } = anchor.web3;

const assert = require("assert");


const { TOKEN_PROGRAM_ID, Token } = require("@solana/spl-token");


describe('avantis-realtime-salary', () => {

  // Configure the client to use the local cluster.
  const provider = anchor.Provider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.AvantisRealtimeSalary;

  it('Is initialized!', async () => {

    const mintAccountKeypair = anchor.web3.Keypair.generate();
    const initilizerKeypair = anchor.web3.Keypair.generate();

    await provider.connection.confirmTransaction(
      await provider.connection.requestAirdrop(initilizerKeypair.publicKey, 10000000000),
      "confirmed"
    );


    const mintAccount = await Token.createMint(
      provider.connection,
      initilizerKeypair,
      mintAccountKeypair.publicKey,
      null,
      0,
      TOKEN_PROGRAM_ID
    );

    const [salaryVaultAccountPDA, salaryVaultAccountPDABump] = await PublicKey.findProgramAddress(
      [Buffer.from(anchor.utils.bytes.utf8.encode("salary_vault_account"))],
      program.programId
    );

    // Add your test here.
    const tx = await program.rpc.initialize(
      salaryVaultAccountPDABump,
      {
        accounts: {
          initializer: initilizerKeypair.publicKey,
          mint: mintAccount.publicKey,
          vaultAccount: salaryVaultAccountPDA,
          systemProgram: anchor.web3.SystemProgram.programId,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
          tokenProgram: TOKEN_PROGRAM_ID,

        },
        signers: [initilizerKeypair],
      }
    );
    let salaryVault = await mintAccount.getAccountInfo(salaryVaultAccountPDA)
    console.log(salaryVault)
    console.log(salaryVaultAccountPDA)


    const [salaryVaultAuthorityPDA, salaryVaultAuthorityPDABump] = await PublicKey.findProgramAddress(
      [Buffer.from(anchor.utils.bytes.utf8.encode("salary_vault_authority"))],
      program.programId
    );

    assert.ok(salaryVault.owner.equals(salaryVaultAuthorityPDA));
  });
});
