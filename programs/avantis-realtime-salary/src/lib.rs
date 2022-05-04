use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, SetAuthority, Token, TokenAccount, Transfer};
use spl_math::precise_number::PreciseNumber;
use spl_token::instruction::AuthorityType;

declare_id!("Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS");

const SALARY_VAULT_PDA_SEED: &[u8] = b"salary_vault_authority";

#[program]
pub mod avantis_realtime_salary {
    use super::*;
    pub fn initialize(
        ctx: Context<Initialize>,
        _salary_vault_account_bump: u8,
        _salary_shared_state_account_bump: u8,
        exchange_rate: u128,
    ) -> ProgramResult {
        // Initialize pool shared account value
        ctx.accounts.salary_program_shared_state.initializer_pubkey = *ctx.accounts.initializer.key;
        ctx.accounts
            .salary_program_shared_state
            .vault_account_pubkey = *ctx.accounts.vault_account.to_account_info().key;
        ctx.accounts
            .salary_program_shared_state.total_salary = 0 as u128;
        ctx.accounts.salary_program_shared_state.exchange_rate = exchange_rate;
        ctx.accounts.salary_program_shared_state.last_updated_timestamp = Clock::get().unwrap().unix_timestamp;

        // Transfer ownership of Salary's Vault to program
        let (salary_vault_authority, _bump) =
            Pubkey::find_program_address(&[SALARY_VAULT_PDA_SEED], ctx.program_id);

        token::set_authority(
            ctx.accounts.into_set_authority_context(),
            AuthorityType::AccountOwner,
            Some(salary_vault_authority),
        ).unwrap();
        Ok(())
    }

    pub fn update_exchange_rate(
        ctx: Context<Initialize>,
        exchange_rate: u128,
    ) -> ProgramResult {
        let current_timestamp = Clock::get().unwrap().unix_timestamp;
        let accumulated_salary_per_share= calculate_accumulated_salary_per_share(
            PreciseNumber::new(ctx.accounts.salary_program_shared_state.total_salary as u128).unwrap(),
            PreciseNumber::new(ctx.accounts.salary_program_shared_state.last_updated_timestamp as u128).unwrap(),
            PreciseNumber::new(current_timestamp as u128).unwrap(),
            PreciseNumber::new(ctx.accounts.salary_program_shared_state.exchange_rate).unwrap(),
        );
        ctx.accounts.salary_program_shared_state.accumulated_salary_per_share = accumulated_salary_per_share.to_imprecise().unwrap();
        ctx.accounts.salary_program_shared_state.exchange_rate = exchange_rate;
        ctx.accounts.salary_program_shared_state.last_updated_timestamp = current_timestamp;

        // Transfer ownership of Salary's Vault to program
        let (salary_vault_authority, _bump) =
            Pubkey::find_program_address(&[SALARY_VAULT_PDA_SEED], ctx.program_id);

        token::set_authority(
            ctx.accounts.into_set_authority_context(),
            AuthorityType::AccountOwner,
            Some(salary_vault_authority),
        ).unwrap();
        Ok(())
    }

    pub fn add_employee(ctx: Context<AddEmployee>, salary_rate_thb: u128, _bump: u8) -> ProgramResult {
        let current_timestamp = Clock::get().unwrap().unix_timestamp;
        let accumulated_salary_per_share= calculate_accumulated_salary_per_share(
            PreciseNumber::new(ctx.accounts.salary_program_shared_state.total_salary as u128).unwrap(),
            PreciseNumber::new(ctx.accounts.salary_program_shared_state.last_updated_timestamp as u128).unwrap(),
            PreciseNumber::new(current_timestamp as u128).unwrap(),
            PreciseNumber::new(ctx.accounts.salary_program_shared_state.exchange_rate).unwrap(),
        );

        ctx.accounts.salary_program_shared_state.accumulated_salary_per_share = accumulated_salary_per_share.to_imprecise().unwrap();
        ctx.accounts.salary_program_shared_state.last_updated_timestamp = current_timestamp;

        ctx.accounts.salary_program_shared_state.total_salary += salary_rate_thb;

        ctx.accounts
            .employee_salary_state
            .salary_vault_account_pubkey = ctx
            .accounts
            .salary_program_shared_state
            .vault_account_pubkey;
        ctx.accounts.employee_salary_state.salary_rate_thb = salary_rate_thb;
        ctx.accounts.employee_salary_state.salary_debt = PreciseNumber::new(salary_rate_thb).unwrap()
            .checked_mul(&PreciseNumber::new(ctx.accounts.salary_program_shared_state.accumulated_salary_per_share).unwrap()).unwrap()
            .to_imprecise().unwrap();

        ctx.accounts.employee_salary_state.employee_pubkey = *ctx.accounts.employee.key;
        ctx.accounts
            .employee_salary_state
            .employee_token_account_pubkey = ctx.accounts.employee_token_account.key();
        ctx.accounts.employee_salary_state.last_claimed_timestamp = current_timestamp;

        Ok(())
    }

    pub fn claim_salary(ctx: Context<ClaimSalary>) -> ProgramResult {
        let current_timestamp = Clock::get().unwrap().unix_timestamp;
        let accumulated_salary_per_share_since_latest = calculate_accumulated_salary_per_share(
            PreciseNumber::new(ctx.accounts.salary_program_shared_state.total_salary as u128).unwrap(),
            PreciseNumber::new(ctx.accounts.salary_program_shared_state.last_updated_timestamp as u128).unwrap(),
            PreciseNumber::new(current_timestamp as u128).unwrap(),
            PreciseNumber::new(ctx.accounts.salary_program_shared_state.exchange_rate).unwrap(),
        );
        let accumulated_salary_per_share = accumulated_salary_per_share_since_latest
            .checked_add(&PreciseNumber::new(ctx.accounts.salary_program_shared_state.accumulated_salary_per_share).unwrap()).unwrap();

        ctx.accounts.salary_program_shared_state.accumulated_salary_per_share = accumulated_salary_per_share.to_imprecise().unwrap();
        ctx.accounts.salary_program_shared_state.last_updated_timestamp = current_timestamp;

        let claimer_salary_state = &mut ctx.accounts.employee_salary_state;
        let current_timestamp = Clock::get().unwrap().unix_timestamp;

        let claimable_amount = PreciseNumber::new(claimer_salary_state.salary_rate_thb).unwrap()
            .checked_mul(&accumulated_salary_per_share).unwrap()
            .checked_sub(&PreciseNumber::new(claimer_salary_state.salary_debt).unwrap()).unwrap();

        // after calculate claimable amount , then reset last claimed timestamp to now.
        claimer_salary_state.last_claimed_timestamp = current_timestamp;

        claimer_salary_state.salary_debt = PreciseNumber::new(claimer_salary_state.salary_debt).unwrap()
            .checked_add(&claimable_amount).unwrap()
            .to_imprecise().unwrap();

        let (_vault_authority, vault_authority_bump) =
            Pubkey::find_program_address(&[SALARY_VAULT_PDA_SEED], ctx.program_id);
        let vault_authority_seed = &[&SALARY_VAULT_PDA_SEED[..], &[vault_authority_bump]];

        token::transfer(
            ctx.accounts
                .into_transfer_to_claimer_context()
                .with_signer(&[&vault_authority_seed[..]]),
            claimable_amount.to_imprecise().unwrap() as u64,
        ).unwrap();

        Ok(())
    }

    pub fn deposit_to_vault(ctx: Context<DepositToVault>, deposit_amount: u64) -> ProgramResult {
        // Transfer depositor's token to vault
        token::transfer(
            ctx.accounts.into_transfer_to_vault_context(),
            deposit_amount,
        ).unwrap();
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
        space = std::mem::size_of::<Account<'info, SalaryProgramSharedState>>()
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

#[derive(Accounts)]
pub struct UpdateExchangeRate<'info> {
    #[account(mut)]
    pub initializer: Signer<'info>,
    #[account(mut)]
    pub salary_program_shared_state: Account<'info, SalaryProgramSharedState>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
    pub mint: Account<'info, Mint>,
}

#[account]
pub struct SalaryProgramSharedState {
    pub initializer_pubkey: Pubkey,
    pub vault_account_pubkey: Pubkey,
    pub total_salary: u128,
    pub exchange_rate: u128,
    pub accumulated_salary_per_share: u128,
    pub last_updated_timestamp: i64,
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
        space = std::mem::size_of::<Account<'info, EmployeeSalaryState>>(),
    )]
    pub employee_salary_state: Account<'info, EmployeeSalaryState>,
    pub employee_token_account: Account<'info, TokenAccount>,
    /// CHECK: we dont need to check this employee
    pub employee: AccountInfo<'info>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[account]
pub struct EmployeeSalaryState {
    pub salary_vault_account_pubkey: Pubkey,
    pub employee_pubkey: Pubkey,
    pub employee_token_account_pubkey: Pubkey,
    pub salary_rate_thb: u128,
    pub salary_debt: u128,
    pub last_claimed_timestamp: i64,
}

#[derive(Accounts)]
pub struct ClaimSalary<'info> {
    pub claimer: Signer<'info>,
    #[account(mut)]
    pub salary_program_shared_state: Account<'info, SalaryProgramSharedState>,
    #[account(mut)]
    pub employee_token_account: Account<'info, TokenAccount>,
    #[account(
        mut,
        constraint = salary_program_shared_state.vault_account_pubkey == *vault_account.to_account_info().key
    )]
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

pub fn calculate_accumulated_salary_per_share(
    total_salary_thb: PreciseNumber,
    last_claimed_timestamp: PreciseNumber,
    now: PreciseNumber,
    exchange_rate: PreciseNumber,
) -> PreciseNumber {
    let sec_diff = now.checked_sub(&last_claimed_timestamp).unwrap();
    let day = PreciseNumber::new(24 * 60 * 60).unwrap();
    let amount_usd_per_sec = total_salary_thb.checked_div(&day).unwrap().checked_div(&exchange_rate).unwrap();
    sec_diff.checked_mul(&amount_usd_per_sec).unwrap().checked_div(&total_salary_thb).unwrap()
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
