use anchor_lang::prelude::*;

use anchor_lang::prelude::*;
use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, Transfer};
use anchor_spl::token::{Mint, SetAuthority, TokenAccount};
use spl_token::instruction::AuthorityType;

declare_id!("Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS");

#[program]
pub mod avantis_realtime_salary {
    use super::*;
    pub fn initialize(ctx: Context<Initialize>) -> ProgramResult {
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
        seeds = [b"salary_vault_account".as_ref()],
        bump = salary_vault_account_bump,
        payer = initializer,
        token::mint = mint,
        token::authority = initializer,
    )]
    pub vault_account: Account<'info, TokenAccount>,
    pub token_account: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
    pub mint: Account<'info, Mint>,
}

#[derive(Accounts)]
#[instruction(daily_rate: u64, bump: u8)]
pub struct AddEmployee<'info> {
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
    pub employee_token_account: Account<'info, TokenAccount>,
    pub vault_account: Account<'info, TokenAccount>,
    pub pool_vault_authority: AccountInfo<'info>,
}
