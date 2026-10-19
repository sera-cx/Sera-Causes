/**
 * Finaliser CLI (stewards run this in advisory mode). Every command prints what
 * it will do and only acts with --yes.
 *
 *   pnpm finaliser tally <causeId> <claim>
 *   pnpm finaliser finalise <causeId> <claim> <verified|not_verified|needs_more> [--dry-run] --yes
 *   pnpm finaliser resolve-challenge <id> <upheld|rejected> --yes
 *   pnpm finaliser urgent-appeal <causeId> "<reason>" [--ends 2026-11-01T00:00:00Z] --yes
 *   pnpm finaliser urgent-appeal clear --yes
 *   pnpm finaliser hide <causeId> "<reason>" --yes        (or `unhide <causeId>`)
 */
import { config } from '../config.js';
import { db, disconnectDb } from '../db.js';
import { resolveChallenge } from '../ledger/rewards.js';
import { buildInputs, openChallengeWindow, parseClaim, parseOutcome, publishInputs, sendFinaliseClaim } from './core.js';

const argv = process.argv.slice(2);
const flags = new Set(argv.filter((a) => a.startsWith('--')));
const args = argv.filter((a) => !a.startsWith('--'));
const yes = flags.has('--yes');
const dryRun = flags.has('--dry-run');
const flagValue = (name: string): string | undefined => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
};
const out = (s: string) => process.stdout.write(`${s}\n`);
const say = (s: string) => process.stderr.write(`${s}\n`);

function needYes(action: string): boolean {
  if (yes) return true;
  say(`\n${action}\nRe-run with --yes to do it.`);
  return false;
}

async function main(): Promise<number> {
  const c = config();
  const [cmd] = args;
  switch (cmd) {
    case 'tally': {
      const causeId = Number(args[1]);
      const claim = parseClaim(args[2] ?? '');
      const inputs = await buildInputs(causeId, claim, 'verified');
      const t = inputs.tally;
      out(`Cause ${causeId} claim ${claim} epoch ${inputs.epoch} (${inputs.decidedBy} decide, mode ${c.verificationMode})`);
      out(`Votes: ${inputs.votes.length} (${t.voters} voters)  Paths: ${inputs.paths.length}`);
      out(`Weight: verified ${t.verified.toFixed(2)}  not ${t.not.toFixed(2)}  more ${t.more.toFixed(2)}  total ${t.total.toFixed(2)}`);
      out(`Quorum ${t.quorumMet ? 'met' : 'not met'} (need ${7}), verified share ${(t.verifiedShare * 100).toFixed(1)}% (need 75%), passed: ${t.passed}`);
      out(`Tally outcome: ${t.outcome}   Merkle root over ${inputs.leaves.length} leaves: ${inputs.resultRoot}`);
      for (const v of inputs.votes) out(`  vote  ${v.voter}  ${v.choice.padEnd(12)} w=${v.weight.toFixed(2)}  ${v.reason}`);
      for (const p of inputs.paths) out(`  path  ${p.author}  ${p.result.padEnd(15)} ${p.contentHash}`);
      return 0;
    }
    case 'finalise': {
      const causeId = Number(args[1]);
      const claim = parseClaim(args[2] ?? '');
      const outcome = parseOutcome(args[3] ?? '');
      const inputs = await buildInputs(causeId, claim, outcome);
      out(`Will finalise cause ${causeId} claim ${claim} epoch ${inputs.epoch} as ${outcome}.`);
      out(`Tally says ${inputs.tally.outcome} (passed ${inputs.tally.passed}, quorum ${inputs.tally.quorumMet}); ${inputs.decidedBy} decide in ${c.verificationMode} mode.`);
      if (inputs.tally.outcome !== outcome) say(`Note: the chosen outcome differs from the tally. Stewards may do this in advisory mode; the published inputs show both.`);
      out(`Inputs: ${inputs.votes.length} votes, ${inputs.paths.length} paths, root ${inputs.resultRoot}`);
      out(`Steps: 1) write public/results/${causeId}-${claim}-${inputs.epoch}.json  2) finaliseClaim on ${c.REGISTRY_ADDRESS} (chain ${c.CHAIN_ID})  3) open the 72 h challenge window`);
      if (dryRun) {
        const file = await publishInputs(inputs);
        out(`dry run: wrote ${file}; nothing sent.`);
        return 0;
      }
      if (!needYes('This sends an on-chain transaction with FINALISER_PRIVATE_KEY.')) return 2;
      const file = await publishInputs(inputs);
      out(`wrote ${file}`);
      if (c.hasChain && c.FINALISER_PRIVATE_KEY) {
        const hash = await sendFinaliseClaim(inputs);
        out(`finaliseClaim sent: ${hash}`);
      } else {
        say('No RPC_URL/REGISTRY_ADDRESS/FINALISER_PRIVATE_KEY: recorded locally only (the listener would otherwise mirror the event).');
      }
      await openChallengeWindow(inputs);
      out(`challenge window open for 72 hours on cause ${causeId} claim ${claim}.`);
      return 0;
    }
    case 'resolve-challenge': {
      const id = args[1] ?? '';
      const verdict = args[2];
      if (verdict !== 'upheld' && verdict !== 'rejected') throw new Error('verdict must be upheld or rejected');
      const ch = await db().challenge.findUnique({ where: { id } });
      if (!ch) throw new Error(`challenge ${id} not found`);
      out(`Challenge ${id} by ${ch.challenger} on cause ${ch.causeId} claim ${ch.claimType} epoch ${ch.epoch} (state ${ch.state}, stake ${ch.stake}).`);
      out(verdict === 'upheld' ? 'Upheld: stake back plus 2,000 gSera, overturned paths and votes lose 3 reputation, the claim reopens at a new epoch. Then run `finalise` with the flipped outcome.' : 'Rejected: the stake stays burned and the claim result stands.');
      if (!needYes('This settles gSera and reputation.')) return 2;
      await resolveChallenge(id, verdict);
      out(`challenge ${id} ${verdict}.`);
      return 0;
    }
    case 'urgent-appeal': {
      const steward = c.STEWARD_WALLETS[0] ?? 'finaliser-cli';
      if (args[1] === 'clear') {
        const active = await db().urgentAppeal.count({ where: { clearedAt: null } });
        out(`Will clear ${active} active urgent appeal(s).`);
        if (!needYes('This takes the urgent appeal off the homepage.')) return 2;
        await db().urgentAppeal.updateMany({ where: { clearedAt: null }, data: { clearedAt: new Date(), clearedBy: steward } });
        out('cleared.');
        return 0;
      }
      const causeId = Number(args[1]);
      const reason = args[2] ?? '';
      if (!causeId || !reason) throw new Error('usage: urgent-appeal <causeId> "<reason>" [--ends <iso>] | urgent-appeal clear');
      const ends = flagValue('--ends');
      const cause = await db().cause.findUnique({ where: { id: causeId } });
      if (!cause) throw new Error(`cause ${causeId} not found`);
      out(`Will pin cause ${causeId} (${cause.slug}) as "Urgent appeal, chosen by Sera.cx"${ends ? ` until ${ends}` : ''}: ${reason}`);
      if (!needYes('This replaces any current urgent appeal (one at a time).')) return 2;
      await db().urgentAppeal.updateMany({ where: { clearedAt: null }, data: { clearedAt: new Date(), clearedBy: steward } });
      const a = await db().urgentAppeal.create({ data: { causeId, reason, setBy: steward, endsAt: ends ? new Date(ends) : null } });
      out(`urgent appeal ${a.id} set.`);
      return 0;
    }
    case 'hide':
    case 'unhide': {
      const causeId = Number(args[1]);
      const reason = args[2] ?? '';
      const hide = cmd === 'hide';
      if (!causeId || (hide && !reason)) throw new Error('usage: hide <causeId> "<reason>" | unhide <causeId>');
      const cause = await db().cause.findUnique({ where: { id: causeId } });
      if (!cause) throw new Error(`cause ${causeId} not found`);
      out(hide ? `Will take cause ${causeId} (${cause.slug}) off the homepage with public reason: ${reason}` : `Will restore the creator's homepage setting for cause ${causeId} (${cause.slug}).`);
      if (!needYes('This changes what the homepage shows.')) return 2;
      const steward = c.STEWARD_WALLETS[0] ?? 'finaliser-cli';
      const data = hide ? { stewardHiddenReason: reason, stewardHiddenBy: steward, stewardHiddenAt: new Date() } : { stewardHiddenReason: null, stewardHiddenBy: null, stewardHiddenAt: null };
      await db().homepageFlag.upsert({ where: { causeId }, create: { causeId, shown: false, setBy: steward, signature: 'steward', signedAt: new Date(), ...data }, update: data });
      out(hide ? 'hidden.' : 'restored.');
      return 0;
    }
    default:
      say('usage: finaliser <tally|finalise|resolve-challenge|urgent-appeal|hide|unhide> ... [--yes] [--dry-run]');
      return 1;
  }
}

main()
  .then(async (code) => {
    await disconnectDb();
    process.exit(code);
  })
  .catch(async (err) => {
    say(`error: ${err instanceof Error ? err.message : String(err)}`);
    await disconnectDb();
    process.exit(1);
  });
