import { supabase } from '../utils/supabase';
import { CashBalance, CashBalanceInput, CashCurrency } from '../types/cashBalance';

// ────────────────────────────────────────────
// CashBalance API
// ────────────────────────────────────────────

/**
 * 예수금 목록 조회: recorded_at 내림차순으로 반환한다.
 * currency 필터를 전달하면 해당 통화만 조회한다.
 */
export async function getCashBalances(currency?: CashCurrency): Promise<CashBalance[]> {
  let query = supabase
    .from('cash_balances')
    .select('*')
    .order('recorded_at', { ascending: false });

  if (currency) {
    query = query.eq('currency', currency);
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  return (data ?? []) as CashBalance[];
}

/**
 * 예수금 스냅샷 등록: cash_balances 테이블에 단건 삽입한다.
 */
export async function createCashBalance(data: CashBalanceInput): Promise<CashBalance> {
  const { data: result, error } = await supabase
    .from('cash_balances')
    .insert(data)
    .select()
    .single();

  if (error) {
    throw error;
  }

  return result as CashBalance;
}
