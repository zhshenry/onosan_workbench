import { z } from 'zod';
import { GAME_TASKS, GameOnlineUrlSchema } from './game-contracts';

const taskId = z.enum(GAME_TASKS.map(task => task.id));
export const GameIssueIdSchema = z.string().regex(/^TD-\d{8}-[a-f0-9]{8}$/);
export const GameIssueDraftSchema = z.object({
  title: z.string().trim().min(1, '请填写问题标题。').max(160),
  steps: z.string().trim().min(1, '请填写复现步骤。').max(4000),
  expected: z.string().trim().min(1, '请填写期望表现。').max(2000),
  actual: z.string().trim().min(1, '请填写实际表现。').max(2000),
  environment: z.enum(['local', 'online']), pageUrl: GameOnlineUrlSchema,
  viewport: z.enum(['fit', 'desktop', 'narrow']), zoom: z.number().min(.25).max(5),
  profile: z.enum(['keep', 'fresh']), taskId: taskId.optional(),
  screenshotIds: z.array(z.string().min(1).max(100)).max(6),
  includeTest: z.boolean(), includeLogs: z.boolean(),
});
export type GameIssueDraft = z.infer<typeof GameIssueDraftSchema>;
export const GameIssueRecordSchema = GameIssueDraftSchema.extend({
  schemaVersion: z.literal(1), id: GameIssueIdSchema, createdAt: z.number(),
  projectRoot: z.string(), revision: z.string(), siteUrl: GameOnlineUrlSchema,
  onlineCheck: z.object({ url: z.string(), status: z.enum(['checking', 'passed', 'failed']), message: z.string(), checkedAt: z.number().optional(), httpStatus: z.number().optional() }).nullable(),
  test: z.object({ taskId, status: z.string(), output: z.string(), message: z.string(), revision: z.string(), startedAt: z.number().optional(), finishedAt: z.number().optional(), exitCode: z.number().nullable().optional() }).nullable(),
  logs: z.array(z.string()),
  images: z.array(z.object({ id: z.string(), name: z.string(), file: z.string().regex(/^screenshots\/[1-6]\.png$/) })).max(6),
});
export type GameIssueRecord = z.infer<typeof GameIssueRecordSchema>;
export type GameIssue = GameIssueRecord & { directory: string };
export type GameIssueSummary = Pick<GameIssue, 'id' | 'title' | 'createdAt' | 'environment'>;
export interface GameIssueImage { issueId?: string; id: string; }
export interface GameIssueBridge {
  directory(): Promise<string>;
  list(): Promise<GameIssueSummary[]>;
  read(id: string): Promise<GameIssue>;
  save(draft: GameIssueDraft): Promise<GameIssue>;
  preview(image: GameIssueImage): Promise<string>;
  openImage(image: GameIssueImage): Promise<void>;
  openFolder(id?: string): Promise<void>;
  export(id: string): Promise<string | null>;
}
