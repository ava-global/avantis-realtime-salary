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

    const [salaryProgramSharedStatePDA, salaryProgramSharedStatePDABump] = await PublicKey.findProgramAddress(
      [Buffer.from(anchor.utils.bytes.utf8.encode("salary_shared_state_account"))],
      program.programId
    );

    const [salaryVaultAccountPDA, salaryVaultAccountPDABump] = await PublicKey.findProgramAddress(
      [Buffer.from(anchor.utils.bytes.utf8.encode("salary_vault_account"))],
      program.programId
    );

    // Add your test here.
    const tx = await program.rpc.initialize(
      salaryVaultAccountPDABump, salaryProgramSharedStatePDABump,
      {
        accounts: {
          initializer: initilizerKeypair.publicKey,
          mint: mintAccount.publicKey,
          salaryProgramSharedState: salaryProgramSharedStatePDA,
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

    const [salaryProgramSharedStatePDA, salaryProgramSharedStatePDABump] = await PublicKey.findProgramAddress(
      [Buffer.from(anchor.utils.bytes.utf8.encode("salary_shared_state_account"))],
      program.programId
    );


    const [employeeSalaryStatePDA, employeeSalaryStatePDABump] = await PublicKey.findProgramAddress(
      [employee1Keypair.publicKey.toBuffer()],
      program.programId
    );

    employee1TokenAccount = await mintAccount.createAccount(employee1Keypair.publicKey);

    // expect daily rate to 1 token per 1 sec
    // this will be easier when we assert claim amount
    const daily_rate = new anchor.BN(24 * 60 * 60);
    const tx = await program.rpc.addEmployee(
      daily_rate, employeeSalaryStatePDABump,
      {
        accounts: {
          adder: initilizerKeypair.publicKey,
          salaryProgramSharedState: salaryProgramSharedStatePDA,
          employeeSalaryState: employeeSalaryStatePDA,
          employeeTokenAccount: employee1TokenAccount,
          employee: employee1Keypair.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        },
        signers: [initilizerKeypair],
      }
    );

    let employee1SalaryStateAccount = await program.account.employeeSalaryState.fetch(
      employeeSalaryStatePDA
    );

    assert.equal(employee1SalaryStateAccount.dailyRate, 24 * 60 * 60);

  });


  it('Who is not initialzer cannot add employee', async () => {
    const fakeInitilizerKeypair = anchor.web3.Keypair.generate();
    await provider.connection.confirmTransaction(
      await provider.connection.requestAirdrop(fakeInitilizerKeypair.publicKey, 10000000000),
      "confirmed"
    );

    const [salaryProgramSharedStatePDA, salaryProgramSharedStatePDABump] = await PublicKey.findProgramAddress(
      [Buffer.from(anchor.utils.bytes.utf8.encode("salary_shared_state_account"))],
      program.programId
    );

    const [employeeSalaryStatePDA, employeeSalaryStatePDABump] = await PublicKey.findProgramAddress(
      [employee2Keypair.publicKey.toBuffer()],
      program.programId
    );

    employee2TokenAccount = await mintAccount.createAccount(employee2Keypair.publicKey);

    console.log("initializer: ", fakeInitilizerKeypair.publicKey)
    console.log("fakeinitializer: ", initilizerKeypair.publicKey)
    const daily_rate = new anchor.BN(1000);

    try {
      await program.rpc.addEmployee(
        daily_rate, employeeSalaryStatePDABump,
        {
          accounts: {
            adder: fakeInitilizerKeypair.publicKey,
            salaryProgramSharedState: salaryProgramSharedStatePDA,
            employeeSalaryState: employeeSalaryStatePDA,
            employeeTokenAccount: employee2TokenAccount,
            employee: employee2Keypair.publicKey,
            systemProgram: anchor.web3.SystemProgram.programId,
            rent: anchor.web3.SYSVAR_RENT_PUBKEY,
          },
          signers: [fakeInitilizerKeypair],
        }
      );
      assert.ok(false);
    } catch (err) {
      const errMsg = "A raw constraint was violated";
      assert.equal(err.toString(), errMsg);
    }

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


  it('Employee can claim all of remaining salary', async () => {
    const [salaryVaultAccountPDA, salaryVaultAccountPDABump] = await PublicKey.findProgramAddress(
      [Buffer.from(anchor.utils.bytes.utf8.encode("salary_vault_account"))],
      program.programId
    );

    const [salaryVaultAuthorityPDA, salaryVaultAuthorityPDABump] = await PublicKey.findProgramAddress(
      [Buffer.from(anchor.utils.bytes.utf8.encode("salary_vault_authority"))],
      program.programId
    );

    const [salaryStatePDA, salaryStatePDABump] = await PublicKey.findProgramAddress(
      [employee1Keypair.publicKey.toBuffer()],
      program.programId
    );

    let employeeAmountBeforeClaim = await mintAccount.getAccountInfo(employee1TokenAccount);
    employeeAmountBeforeClaim = employeeAmountBeforeClaim.amount.toNumber();

    //sleep for 5 seconds to wait for claimable amount
    await sleep(5000);

    const tx = await program.rpc.claimSalary(
      {
        accounts: {
          claimer: employee1Keypair.publicKey,
          employeeTokenAccount: employee1TokenAccount,
          vaultAccount: salaryVaultAccountPDA,
          employeeSalaryState: salaryStatePDA,
          vaultAuthority: salaryVaultAuthorityPDA,
          tokenProgram: TOKEN_PROGRAM_ID
        },
        signers: [employee1Keypair],
      }
    );

    let employeeAmountAfterClaim = await mintAccount.getAccountInfo(employee1TokenAccount);
    employeeAmountAfterClaim = employeeAmountAfterClaim.amount.toNumber();

    let totalClaimedAmount = employeeAmountAfterClaim - employeeAmountBeforeClaim;

    console.log("total claimed amount", totalClaimedAmount);
    assert.ok(totalClaimedAmount > 5);

  });


});

function sleep(ms) {
  console.log("Sleeping for", ms / 1000, "seconds");
  return new Promise((resolve) => setTimeout(resolve, ms));
}