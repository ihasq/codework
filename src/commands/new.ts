import { appendEvents, readEvents } from "../core/events.ts";
import { renderGuide } from "../core/render.ts";
import {
  addOrRejoinAgent,
  createEvent,
  createWorkspaceState,
  latestEventId,
  loadState,
  resetWorkspaceFiles,
  saveState,
  truncateEvents
} from "../core/state.ts";
import type { CommandContext, CommandResult } from "../core/types.ts";
import { CodeworkError, normalizeFollow, required, slugifyIdentifier } from "../core/validate.ts";
import { withWorkspaceLock } from "../core/lock.ts";
import { resolveCodeworkPaths } from "../core/paths.ts";

export type NewCommandOptions = {
  follow?: string;
  role?: string;
  goal?: string;
  force?: boolean;
};

export async function runNewCommand(ctx: CommandContext, options: NewCommandOptions): Promise<CommandResult> {
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
    const existing = await loadState(paths.workspaceDir!);
    if (existing && !options.force) {
      throw new CodeworkError(3, `Workspace already exists: ${workspace.value}. Use --force to recreate it.`);
    }
    if (existing && options.force) {
      await resetWorkspaceFiles(paths.workspaceDir!);
    }
    await truncateEvents(paths.workspaceDir!);

    const state = createWorkspaceState(paths, workspace.value);
    const { agent } = addOrRejoinAgent(state, {
      name: name.value,
      follow,
      role: options.role,
      cursorEventId: 0,
      autoNamed: false,
      leadership: "leader"
    });
    state.leaderAgent = agent.name;

    const events = [
      createEvent(state, {
        actor: agent.name,
        type: "workspace.created",
        payload: {
          root: paths.root,
          home: paths.home,
          goal: options.goal
        }
      }),
      createEvent(state, {
        actor: agent.name,
        type: "agent.joined",
        payload: {
          name: agent.name,
          role: agent.role,
          follow: agent.follow,
          leadership: agent.leadership,
          sessionCount: agent.sessionCount,
          rejoin: false
        }
      })
    ];

    agent.cursorEventId = latestEventId(state);
    await appendEvents(paths.workspaceDir!, events);
    await saveState(paths.workspaceDir!, state);
    const allEvents = await readEvents(paths.workspaceDir!);

    const text = renderGuide({
      state,
      agentName: agent.name,
      unreadEvents: [],
      allEvents,
      notice: [
        `Workspace created: ${workspace.value}.`,
        `Agent registered: ${agent.name}.`,
        "This agent must keep using Codework commands for coordination."
      ],
      recommendedCommand: `codework poll --workspace=${workspace.value} --name=${agent.name} --wait=30 --interval=2`
    });

    return {
      text,
      quietText: `workspace=${workspace.value} agent=${agent.name} created\n`,
      json: {
        ok: true,
        command: "new",
        workspace: state.workspace,
        agent,
        events
      }
    };
  });
}

export function requireNewOptions(options: NewCommandOptions): void {
  required(options.follow, "--follow");
}
