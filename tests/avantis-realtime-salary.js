const anchor = require('@project-serum/anchor');

const { PublicKey, Transaction, SystemProgram } = anchor.web3;

const assert = require("assert");


const { TOKEN_PROGRAM_ID, Token } = require("@solana/spl-token");


describe('avantis-realtime-salary', () => {

  // Configure the client to use the local cluster.
  const provider = anchor.Provider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.AvantisRealtimeSalary;
  const mintAccountKeypair = anchor.web3.Keypair.generate();
  const initilizerKeypair = anchor.web3.Keypair.generate();
  const employee1Keypair = anchor.web3.Keypair.generate();
  const employee2Keypair = anchor.web3.Keypair.generate();

  let mintAccount;

  it('Is initialized!', async () => {


    await provider.connection.confirmTransaction(
      await provider.connection.requestAirdrop(initilizerKeypair.publicKey, 10000000000),
      "confirmed"
    );


    mintAccount = await Token.createMint(
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

  it('Add Employee should save correct state', async () => {


    const [salaryStatePDA, salaryStatePDABump] = await PublicKey.findProgramAddress(
        [employee1Keypair.publicKey.toBuffer()],
        program.programId
    );

    employee1TokenAccount = await mintAccount.createAccount(employee1Keypair.publicKey);

    const daily_rate = new anchor.BN(1000);
    const tx = await program.rpc.addEmployee(
        daily_rate, salaryStatePDABump,
        {
          accounts: {
            adder: initilizerKeypair.publicKey,
            employeeSalaryState: salaryStatePDA,
            employeeTokenAccount: employee1TokenAccount,
            employee: employee1Keypair.publicKey,
            systemProgram: anchor.web3.SystemProgram.programId,
            rent: anchor.web3.SYSVAR_RENT_PUBKEY,
          },
          signers: [initilizerKeypair],
        }
    );

    let employee1SalaryStateAccount = await program.account.employeeSalaryState.fetch(
        salaryStatePDA
    );

    assert.equal(employee1SalaryStateAccount.dailyRate, 1000);

  });

  it('Employer can deposit to vault', async () => {
    let depositAmount = 1000

    const [salaryVaultAccountPDA, salaryVaultAccountPDABump] = await PublicKey.findProgramAddress(
        [Buffer.from(anchor.utils.bytes.utf8.encode("salary_vault_account"))],
        program.programId
    );

    employerTokenAccount = await mintAccount.createAccount(initilizerKeypair.publicKey);

    // Mint token to employer
    await mintAccount.mintTo(
        employerTokenAccount,
        mintAccountKeypair.publicKey,
        [mintAccountKeypair],
        100000
    );

    let vaultTokenBeforeDeposit = await mintAccount.getAccountInfo(salaryVaultAccountPDA);
    let vaultAmountBeforeDeposit = vaultTokenBeforeDeposit.amount.toNumber()

    const tx = await program.rpc.depositToVault(
        new anchor.BN(depositAmount),
        {
          accounts: {
            depositor: initilizerKeypair.publicKey,
            vaultAccount: salaryVaultAccountPDA,
            depositorTokenAccount: employerTokenAccount,
            tokenProgram: TOKEN_PROGRAM_ID,
          },
          signers: [initilizerKeypair],
        }
    );
    let vaultTokenAfterDeposit = await mintAccount.getAccountInfo(salaryVaultAccountPDA);
    let vaultAmountAfterDeposit = vaultTokenAfterDeposit.amount.toNumber()

    assert.equal(vaultAmountBeforeDeposit, 0);
    assert.equal(vaultAmountAfterDeposit, depositAmount);
  });

});
