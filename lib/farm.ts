// Farm plans and farm economics for northline-1.
// Steps are generated from the protocol's own snapshot fields (name, category,
// chain, TVL) plus stated, labelled assumptions — never from a promised token.
// A token is never promised: the steps are how to use the protocol, and usage
// is what any future distribution would read.

import type { Proto } from './model.ts';

export type Verdict = 'Farm' | 'Thin' | 'Skip';

export interface FarmEcon {
  gross: number; // expected gross if the token launches at the base implied value
  fee: number; // total gas for the plan's transactions
  hours: number; // hands-on hours over 8 weeks
  net: number;
  breakEven: number; // % of the assumed farmer pool that must materialise to cover fees
  netPerHour: number;
  verdict: Verdict;
}

// Stated assumptions, shown on the dashboard next to every number they feed.
export const FARMER_POOL_SHARE = 0.05; // 5% of implied value assumed to reach farmers
export const PLAN_TXS = 8; // bridge, approve, deposit, 3 recurring, claim, exit
export const PLAN_HOURS = 3; // hands-on hours over 8 weeks

/** Typical gas per transaction on the protocol's primary chain (USD, labelled estimates). */
export function gasPerTx(chain: string): number {
  const table: Record<string, number> = {
    Ethereum: 8,
    Solana: 0.05,
    Base: 0.3,
    Arbitrum: 0.4,
    Optimism: 0.3,
    'BNB Chain': 0.25,
    Polygon: 0.1,
    Bitcoin: 2,
    'Hyperliquid L1': 0.1,
    Avalanche: 0.3,
  };
  return table[chain] ?? 1;
}

export function primaryChain(p: Proto): string {
  return p.chains[0] ?? 'Ethereum';
}

/** Farm economics for one deposit size. Share = deposit / TVL, pro-rata to capital. */
export function farmEcon(impliedBase: number, tvl: number, chain: string, deposit: number): FarmEcon {
  const gross = FARMER_POOL_SHARE * impliedBase * (deposit / tvl);
  const fee = gasPerTx(chain) * PLAN_TXS;
  const hours = PLAN_HOURS;
  const net = gross - fee;
  const breakEven = gross > 0 ? (fee / gross) * 100 : Infinity;
  const netPerHour = net / hours;
  const verdict: Verdict = netPerHour >= 10 ? 'Farm' : net > 0 ? 'Thin' : 'Skip';
  return { gross, fee, hours, net, breakEven, netPerHour, verdict };
}

function usd(n: number): string {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1000) return `$${Math.round(n).toLocaleString('en-US')}`;
  if (n >= 1) return `$${n.toFixed(2)}`;
  return `$${n.toFixed(2)}`;
}

function gas2(chain: string): string {
  return usd(gasPerTx(chain) * 2);
}

function gasAll(chain: string): string {
  return usd(gasPerTx(chain) * PLAN_TXS);
}

type Ctx = { name: string; chain: string; tvl: string; dep: string; cat: string };

function stepSetup(c: Ctx): string {
  return `Set up a wallet on ${c.chain} and bridge ${c.dep} in stablecoins to it; the bridge and first approval take about 20 minutes and roughly ${gas2(c.chain)} in gas. Keep this wallet dedicated to ${c.name}.`;
}

function stepProof(c: Ctx): string {
  return `After each action, save the transaction hash and a screenshot of your position in ${c.name}; a dated record is what any future distribution would read — without it, the activity is invisible.`;
}

function stepExit(c: Ctx, risk: string): string {
  return `Risks: ${risk}. Exit by unwinding the position in one transaction when the reason to hold is gone; stop if total fees pass ${gasAll(c.chain)} or TVL falls 30% in a week.`;
}

const FAMILIES: Record<string, { core: (c: Ctx) => string; recur: (c: Ctx) => string; risk: string }> = {
  Lending: {
    core: (c) => `Supply ${c.dep} of stablecoins to ${c.name}'s lending market on ${c.chain}; your deposit starts earning the market's supply rate at once, and the supplied balance is the position a future distribution would read.`,
    recur: (c) => `Each week, check the supply rate and rebalance if a better market opens on ${c.chain}; 15 minutes a week, no new deposit required unless you choose to add.`,
    risk: 'smart-contract risk on the protocol, supply-rate swings, and gas spikes on the chain',
  },
  Dexs: {
    core: (c) => `Provide ${c.dep} of liquidity to ${c.name}'s largest stable pair on ${c.chain}, stable against stable first; the LP position, not a single swap, is the activity that counts.`,
    recur: (c) => `Each week, check the pool's range and the fees earned; rebalance only if the price leaves your range, about 15 minutes a week.`,
    risk: 'impermanent loss if prices move apart, smart-contract risk, and thin pools',
  },
  Vault: {
    core: (c) => `Deposit ${c.dep} into ${c.name}'s highest-TVL vault on ${c.chain}; the vault's strategy does the work, and your deposit receipt is the position.`,
    recur: (c) => `Each week, check the vault's reported yield and strategy notes; switch vaults only if the strategy changes materially, about 15 minutes a week.`,
    risk: 'the curator can change strategy, smart-contract risk, and yield that does not cover gas',
  },
  RWA: {
    core: (c) => `Mint or buy ${c.dep} of ${c.name}'s tokenized asset on ${c.chain}; hold it in the same wallet for the full period — holding, not trading, is the activity.`,
    recur: (c) => `Each week, verify the holding and any yield distribution; 10 minutes a week, no trades needed.`,
    risk: 'off-chain issuer and custody risk on top of smart-contract risk, plus redemption limits',
  },
  Derivatives: {
    core: (c) => `Open a small margined position of ${c.dep} notional on ${c.name} on ${c.chain}, with isolated margin and a stop set at entry; the position is the activity, not the leverage.`,
    recur: (c) => `Each week, review funding and margin; close and reopen only to keep the position inside your risk limit, about 20 minutes a week.`,
    risk: 'liquidation if the market moves against you, funding-rate bleed, and smart-contract risk',
  },
  CDP: {
    core: (c) => `Lock ${c.dep} of collateral in ${c.name} on ${c.chain} and mint stablecoins against it at a conservative ratio under 50%; the locked position is the activity.`,
    recur: (c) => `Each week, check the collateral ratio and top up collateral if it drifts toward liquidation; 15 minutes a week.`,
    risk: 'liquidation if collateral falls, oracle risk, and smart-contract risk',
  },
  Restaking: {
    core: (c) => `Restake ${c.dep} of liquid-staking tokens through ${c.name} on ${c.chain}; the restaked position accrues the protocol's yield while it sits.`,
    recur: (c) => `Each week, confirm the restaked balance and any new operator or vault option; 10 minutes a week, no new deposit needed.`,
    risk: 'slashing, lock-up or withdrawal queues, and smart-contract risk',
  },
  Prediction: {
    core: (c) => `Buy ${c.dep} of outcome shares on ${c.name}'s largest market on ${c.chain}; pick the side your research supports and hold to resolution — the held position is the activity.`,
    recur: (c) => `Each week, review open markets and add only when a new market meets your edge; 15 minutes a week, never chase a loss.`,
    risk: 'total loss if your side is wrong, thin markets, and smart-contract risk',
  },
  Basis: {
    core: (c) => `Open a delta-neutral ${c.dep} position through ${c.name} on ${c.chain}: long spot, short the perpetual at the same size, so funding — not price — is what you earn.`,
    recur: (c) => `Each week, check funding rates and rebalance the hedge if the basis drifts; about 20 minutes a week.`,
    risk: 'funding flips negative, exchange and liquidation risk, and smart-contract risk',
  },
  Chain: {
    core: (c) => `Bridge ${c.dep} to ${c.name} and use its native apps: stake part of it and supply the rest to the chain's largest lending market; on-chain activity across two apps is the record.`,
    recur: (c) => `Each week, claim staking rewards and check the lending position; 15 minutes a week.`,
    risk: 'bridge risk, chain downtime, and smart-contract risk on the apps you touch',
  },
  Launchpad: {
    core: (c) => `Stake ${c.dep} in ${c.name}'s launch pool on ${c.chain} to qualify for allocations; the staked allocation, not a single buy, is the position.`,
    recur: (c) => `Each week, check for new launches and review allocations; 15 minutes a week.`,
    risk: 'allocation quality varies, staked funds are locked, and smart-contract risk',
  },
  Payments: {
    core: (c) => `Route ${c.dep} of real payments through ${c.name} on ${c.chain} — pay a bill or a supplier, not a self-transfer; genuine payment flow is the activity.`,
    recur: (c) => `Each week, use ${c.name} for one more real payment; 10 minutes a week.`,
    risk: 'counterparty and settlement risk plus smart-contract risk',
  },
  Generic: {
    core: (c) => `Use ${c.name} as its category intends: put ${c.dep} to work in its main ${c.cat} function on ${c.chain} and keep the position open for the full eight weeks.`,
    recur: (c) => `Each week, check the position and the protocol's announcements; 15 minutes a week, act only when something material changes.`,
    risk: 'smart-contract risk on the protocol and gas spikes on the chain',
  },
};

function familyOf(category: string | null): string {
  switch (category) {
    case 'Lending':
      return 'Lending';
    case 'Dexs':
      return 'Dexs';
    case 'Yield':
    case 'Yield Aggregator':
    case 'Risk Curators':
    case 'Onchain Capital Allocator':
    case 'Asset Management':
      return 'Vault';
    case 'RWA':
      return 'RWA';
    case 'Derivatives':
      return 'Derivatives';
    case 'CDP':
    case 'CDP Manager':
      return 'CDP';
    case 'Restaking':
    case 'Staking Pool':
      return 'Restaking';
    case 'Prediction Market':
      return 'Prediction';
    case 'Basis Trading':
      return 'Basis';
    case 'Chain':
      return 'Chain';
    case 'Launchpad':
      return 'Launchpad';
    case 'Payments':
      return 'Payments';
    default:
      return 'Generic';
  }
}

/** Five concrete steps for one protocol, each 20–600 characters. */
export function farmSteps(p: Proto, deposit = 1000): string[] {
  const chain = primaryChain(p);
  const c: Ctx = {
    name: p.name,
    chain,
    tvl: usd(p.tvl),
    dep: usd(deposit),
    cat: (p.category ?? 'protocol').toLowerCase(),
  };
  const fam = FAMILIES[familyOf(p.category)]!;
  const steps = [stepSetup(c), fam.core(c), fam.recur(c), stepProof(c), stepExit(c, fam.risk)];
  for (const s of steps) {
    if (s.trim().length < 20 || s.trim().length > 600) throw new Error(`farmSteps: step out of range for ${p.slug}`);
  }
  return steps;
}
