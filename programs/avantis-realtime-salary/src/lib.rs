use anchor_lang::prelude::*;

use anchor_lang::prelude::*;
use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, Transfer};
use anchor_spl::token::{Mint, SetAuthority, TokenAccount};
use spl_token::instruction::AuthorityType;
use spl_token::solana_program::clock::UnixTimestamp;

declare_id!("Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS");

const SALARY_VAULT_PDA_SEED: &[u8] = b"salary_vault_authority";

#[program]
pub mod avantis_realtime_salary {
    use super::*;
    pub fn initialize(ctx: Context<Initialize>, _salary_vault_account_bump: u8, _salary_shared_state_account_bump: u8) -> ProgramResult {
        // Initialize pool shared account value
        ctx.accounts.salary_program_shared_state.initializer_pubkey = *ctx.accounts.initializer.key;
        ctx.accounts.salary_program_shared_state.vault_account_pubkey =
            *ctx.accounts.vault_account.to_account_info().key;

        // Transfer ownership of Salary's Vault to program
        let (salary_vault_authority, _bump) =
            Pubkey::find_program_address(&[SALARY_VAULT_PDA_SEED], ctx.program_id);

        token::set_authority(
            ctx.accounts.into_set_authority_context(),
            AuthorityType::AccountOwner,
            Some(salary_vault_authority),
        )?;
        Ok(())
    }

    pub fn add_employee(ctx: Context<AddEmployee>, daily_rate: u64, _bump: u8) -> ProgramResult {
        ctx.accounts.employee_salary_state.salary_vault_account_pubkey = ctx.accounts.salary_program_shared_state.vault_account_pubkey;
        ctx.accounts.employee_salary_state.daily_rate = daily_rate;
        ctx.accounts.employee_salary_state.employee_pubkey = *ctx.accounts.employee.key;
        ctx.accounts.employee_salary_state.employee_token_account_pubkey = ctx.accounts.employee_token_account.key();
        ctx.accounts.employee_salary_state.last_claimed_timestamp = Clock::get()?.unix_timestamp;

        Ok(())
    }

    pub fn claim_salary(ctx: Context<ClaimSalary>) -> ProgramResult {
        unimplemented!();
    }

    pub fn deposit_to_vault(ctx: Context<DepositToVault>, deposit_amount: u64) -> ProgramResult {
        // Transfer depositor's token to vault
        token::transfer(ctx.accounts.into_transfer_to_vault_context(), deposit_amount)?;
        Ok(())
    }
}

#[derive(Accounts)]
#[instruction(salary_vault_account_bump: u8, salary_shared_state_account_bump: u8)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub initializer: Signer<'info>,
    #[account(
        init,
        seeds = [ b"salary_shared_state_account".as_ref()],
        bump = salary_shared_state_account_bump,
        payer = initializer,
        space = 8 + 32 + 32
    )]
    pub salary_program_shared_state: Account<'info, SalaryProgramSharedState>,
    #[account(
        init,
        seeds = [ b"salary_vault_account".as_ref()],
        bump = salary_vault_account_bump,
        payer = initializer,
        token::mint = mint,
        token::authority = initializer,
    )]
    pub vault_account: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
    pub mint: Account<'info, Mint>,

}

#[account]
pub struct SalaryProgramSharedState {
    pub initializer_pubkey: Pubkey,
    pub vault_account_pubkey: Pubkey,
}


impl<'info> Initialize<'info> {
    fn into_set_authority_context(&self) -> CpiContext<'_, '_, '_, 'info, SetAuthority<'info>> {
        let cpi_accounts = SetAuthority {
            account_or_mint: self.vault_account.to_account_info().clone(),
            current_authority: self.initializer.to_account_info().clone(),
        };
        let cpi_program = self.token_program.to_account_info();
        CpiContext::new(cpi_program, cpi_accounts)
    }
}

#[derive(Accounts)]
#[instruction(daily_rate: u64, bump: u8)]
pub struct AddEmployee<'info> {
    #[account(mut)]
    pub adder: Signer<'info>,
    #[account(
        constraint = salary_program_shared_state.initializer_pubkey == *adder.key,
    )]
    pub salary_program_shared_state: Account<'info, SalaryProgramSharedState>,
    #[account(
        init,
        seeds = [employee.key.as_ref()],
        bump = bump,
        payer = adder,
        space = 8 + 32 + 32 + 32 + 8 + 8,
    )]
    pub employee_salary_state: Account<'info, EmployeeSalaryState>,
    pub employee_token_account: Account<'info, TokenAccount>,
    pub employee: AccountInfo<'info>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[account]
pub struct EmployeeSalaryState {
    pub salary_vault_account_pubkey: Pubkey,
    pub employee_pubkey: Pubkey,
    pub employee_token_account_pubkey: Pubkey,
    pub daily_rate: u64,
    pub last_claimed_timestamp: i64,
}

#[derive(Accounts)]
pub struct ClaimSalary<'info> {
    pub claimer: Signer<'info>,
    pub employee_token_account: Account<'info, TokenAccount>,
    pub vault_account: Account<'info, TokenAccount>,
    pub pool_vault_authority: AccountInfo<'info>,
}


#[derive(Accounts)]
#[instruction(deposit_amount: u8)]
pub struct DepositToVault<'info> {
    pub depositor: Signer<'info>,
    #[account(mut)]
    pub vault_account: Account<'info, TokenAccount>,
    #[account(mut)]
    pub depositor_token_account: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

impl<'info> DepositToVault<'info> {
    fn into_transfer_to_vault_context(&self) -> CpiContext<'_, '_, '_, 'info, Transfer<'info>> {
        let cpi_accounts = Transfer {
            from: self.depositor_token_account.to_account_info().clone(),
            to: self.vault_account.to_account_info().clone(),
            authority: self.depositor.to_account_info().clone(),
        };
        let cpi_program = self.token_program.to_account_info();
        CpiContext::new(cpi_program, cpi_accounts)
    }
}