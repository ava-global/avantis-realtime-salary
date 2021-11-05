use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, SetAuthority, Token, TokenAccount, Transfer};
use spl_token::instruction::AuthorityType;

declare_id!("Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS");

const SALARY_VAULT_PDA_SEED: &[u8] = b"salary_vault_authority";

#[program]
pub mod avantis_realtime_salary {
    use super::*;
    pub fn initialize(ctx: Context<Initialize>, _salary_vault_account_bump: u8) -> ProgramResult {
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
        ctx.accounts.employee_salary_state.daily_rate = daily_rate;
        ctx.accounts.employee_salary_state.employee_pubkey = *ctx.accounts.employee.key;
        ctx.accounts.employee_salary_state.employee_token_account =
            ctx.accounts.employee_token_account.key();
        ctx.accounts.employee_salary_state.last_claimed_timestamp =
            Clock::get()?.unix_timestamp as u64; // Any better way to cast to numeric?

        Ok(())
    }

    pub fn claim_salary(ctx: Context<ClaimSalary>) -> ProgramResult {
        let claimer_salary_state = &mut ctx.accounts.employee_salary_state;
        let now = Clock::get()?.unix_timestamp as u64;

        let claimable_amount = calculate_claimable_amount(
            claimer_salary_state.daily_rate,
            claimer_salary_state.last_claimed_timestamp,
            now,
        );

        // after calculate claimable amount , then reset last claimed timestamp to now.
        claimer_salary_state.last_claimed_timestamp = now;

        let (_vault_authority, vault_authority_bump) =
            Pubkey::find_program_address(&[SALARY_VAULT_PDA_SEED], ctx.program_id);
        let vault_authority_seed = &[&SALARY_VAULT_PDA_SEED[..], &[vault_authority_bump]];

        token::transfer(
            ctx.accounts
                .into_transfer_to_claimer_context()
                .with_signer(&[&vault_authority_seed[..]]),
            claimable_amount,
        )?;

        Ok(())
    }
}

#[derive(Accounts)]
#[instruction(salary_vault_account_bump: u8)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub initializer: Signer<'info>,

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
        init,
        seeds = [employee.key.as_ref()],
        bump = bump,
        payer = adder,
        space = 8 + 32 + 32 + 8 + 8,
    )]
    pub employee_salary_state: Account<'info, EmployeeSalaryState>,
    pub employee_token_account: Account<'info, TokenAccount>,
    pub employee: AccountInfo<'info>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[account]
pub struct EmployeeSalaryState {
    pub employee_pubkey: Pubkey,
    pub employee_token_account: Pubkey,
    pub daily_rate: u64,
    pub last_claimed_timestamp: u64,
}

#[derive(Accounts)]
pub struct ClaimSalary<'info> {
    pub claimer: Signer<'info>,
    #[account(mut)]
    pub employee_token_account: Account<'info, TokenAccount>,
    #[account(mut)]
    pub vault_account: Account<'info, TokenAccount>,
    #[account(
        mut,
        constraint = employee_salary_state.employee_pubkey == *claimer.key
    )]
    pub employee_salary_state: Account<'info, EmployeeSalaryState>,
    pub vault_authority: AccountInfo<'info>,
    pub token_program: Program<'info, Token>,
}

impl<'info> ClaimSalary<'info> {
    fn into_transfer_to_claimer_context(&self) -> CpiContext<'_, '_, '_, 'info, Transfer<'info>> {
        let cpi_accounts = Transfer {
            from: self.vault_account.to_account_info().clone(),
            to: self.employee_token_account.to_account_info().clone(),
            authority: self.vault_authority.clone(),
        };
        let cpi_program = self.token_program.to_account_info();
        CpiContext::new(cpi_program, cpi_accounts)
    }
}

pub fn calculate_claimable_amount(daily_rate: u64, last_claimed_timestamp: u64, now: u64) -> u64 {
    let sec_diff = now - last_claimed_timestamp;
    // Should we use spl math ?
    let amount_per_sec = daily_rate / (24 * 60 * 60);
    sec_diff * amount_per_sec
}
