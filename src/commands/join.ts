import { appendEvents, readEvents, relevantUnreadEvents } from "../core/events.ts";
import { withWorkspaceLock } from "../core/lock.ts";
import { resolveCodeworkPaths } from "../core/paths.ts";
import { renderGuide } from "../core/render.ts";
import {
  addOrRejoinAgent,
  createEvent,
  findAgentByFollowValue,
  latestEventId,
  requireState,
  saveState
} from "../core/state.ts";
import type { CodeworkEvent, CommandContext, CommandResult, WorkspaceWarning } from "../core/types.ts";
import { CodeworkError, normalizeFollow, required, slugifyIdentifier } from "../core/validate.ts";

export type JoinCommandOptions = {
  follow?: string;
  role?: string;
};

export async function runJoinCommand(ctx: CommandContext, options: JoinCommandOptions): Promise<CommandResult> {
  const workspace = slugifyIdentifier(ctx.workspace, "--workspace");
  const name = slugifyIdentifier(ctx.name, "--name");
  const follow = normalizeFollow(options.follow);
  const paths = resolveCodeworkPaths({
    cwd: ctx.cwd,
    home: ctx.home,
    workspace: workspace.value,
    debug: ctx.debug
  });

  if (!paths.workspaceDir) {
    throw new CodeworkError(2, "Missing required option: --workspace");
  }

  return withWorkspaceLock(paths.workspaceDir, async () => {
    const state = await requireState(paths);
    const existingLatest = latestEventId(state);
    const { agent, rejoin } = addOrRejoinAgent(state, {
      name: name.value,
      follow,
      role: options.role,
      cursorEventId: rejoinCursorSeed(stateHasAgent(state, name.slug), existingLatest),
      autoNamed: false,
      leadership: follow === "user" && !state.leaderAgent ? "leader" : "follower"
    });
    if (agent.leadership === "leader" && !state.leaderAgent) {
      state.leaderAgent = agent.name;
    }
    const events: CodeworkEvent[] = [
      createEvent(state, {
        actor: agent.name,
        type: "agent.joined",
        payload: {
          name: agent.name,
          role: agent.role,
          follow: agent.follow,
          leadership: agent.leadership,
          sessionCount: agent.sessionCount,
          rejoin
        }
      })
    ];

    const notice = [rejoin ? `Agent rejoined: ${agent.name}.` : `Agent joined: ${agent.name}.`];
    if (follow !== "user" && follow !== "self" && !findAgentByFollowValue(state, follow)) {
      const warning: WorkspaceWarning = {
        code: "follow.target_missing",
        message: `Agent ${agent.name} follows ${follow}, but ${follow} is not registered yet.`,
        createdAt: new Date().toISOString()
      };
      state.warnings.push(warning);
      events.push(
        createEvent(state, {
          actor: agent.name,
          type: "warning.created",
          to: "all",
          payload: warning
        })
      );
      notice.push(`WARNING: ${warning.message}`);
    }

    await appendEvents(paths.workspaceDir!, events);
    if (!rejoin) {
      agent.cursorEventId = latestEventId(state);
    }
    await saveState(paths.workspaceDir!, state);
    const allEvents = await readEvents(paths.workspaceDir!);
    const unread = relevantUnreadEvents(state, allEvents, agent);

    return {
      text: renderGuide({
        state,
        agentName: agent.name,
        unreadEvents: unread,
        allEvents,
        notice,
        recommendedCommand: `codework poll --workspace=${workspace.value} --name=${agent.name} --wait=30 --interval=2`
      }),
      quietText: `workspace=${workspace.value} agent=${agent.name} joined\n`,
      json: {
        ok: true,
        command: "join",
        workspace: state.workspace,
        agent,
        rejoin,
        warnings: state.warnings,
        events
      }
    };
  });
}

function stateHasAgent(state: { agents: Record<string, unknown> }, slug: string): boolean {
  return Boolean(state.agents[slug]);
}

function rejoinCursorSeed(isRejoin: boolean, latest: number): number | undefined {
  return isRejoin ? undefined : latest;
}

export function requireJoinOptions(options: JoinCommandOptions): void {
  required(options.follow, "--follow");
}
