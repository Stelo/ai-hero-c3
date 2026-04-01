import { eq, and, isNull, sql, inArray } from "drizzle-orm";
import { db } from "~/db";
import { lessonComments, users, UserRole } from "~/db/schema";

// ─── Types ───

export type CommentAuthor = {
  id: number;
  name: string;
  avatarUrl: string | null;
  role: UserRole;
};

export type CommentReply = {
  id: number;
  body: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  author: CommentAuthor;
};

export type ThreadedComment = CommentReply & {
  replies: CommentReply[];
};

// ─── Read ───

/**
 * Fetches one page of top-level comments for a lesson plus all replies for
 * those comments. Returns the threaded structure and the total count of
 * top-level comments (for pagination).
 */
export function getCommentsForLesson(
  lessonId: number,
  offset = 0,
  limit = 10
): { comments: ThreadedComment[]; total: number } {
  // 1. Count top-level comments
  const countRow = db
    .select({ count: sql<number>`count(*)` })
    .from(lessonComments)
    .where(
      and(
        eq(lessonComments.lessonId, lessonId),
        isNull(lessonComments.parentId)
      )
    )
    .get();
  const total = countRow?.count ?? 0;

  // 2. Fetch paginated top-level comments with author
  const topLevelRows = db
    .select({
      id: lessonComments.id,
      body: lessonComments.body,
      createdAt: lessonComments.createdAt,
      updatedAt: lessonComments.updatedAt,
      deletedAt: lessonComments.deletedAt,
      authorId: users.id,
      authorName: users.name,
      authorAvatarUrl: users.avatarUrl,
      authorRole: users.role,
    })
    .from(lessonComments)
    .innerJoin(users, eq(lessonComments.userId, users.id))
    .where(
      and(
        eq(lessonComments.lessonId, lessonId),
        isNull(lessonComments.parentId)
      )
    )
    .orderBy(lessonComments.createdAt)
    .limit(limit)
    .offset(offset)
    .all();

  if (topLevelRows.length === 0) {
    return { comments: [], total };
  }

  const topLevelIds = topLevelRows.map((r) => r.id);

  // 3. Fetch all replies for these top-level comments
  const replyRows = db
    .select({
      id: lessonComments.id,
      parentId: lessonComments.parentId,
      body: lessonComments.body,
      createdAt: lessonComments.createdAt,
      updatedAt: lessonComments.updatedAt,
      deletedAt: lessonComments.deletedAt,
      authorId: users.id,
      authorName: users.name,
      authorAvatarUrl: users.avatarUrl,
      authorRole: users.role,
    })
    .from(lessonComments)
    .innerJoin(users, eq(lessonComments.userId, users.id))
    .where(inArray(lessonComments.parentId, topLevelIds))
    .orderBy(lessonComments.createdAt)
    .all();

  // 4. Build reply map
  const replyMap = new Map<number, CommentReply[]>();
  for (const row of replyRows) {
    const reply: CommentReply = {
      id: row.id,
      body: row.body,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      deletedAt: row.deletedAt,
      author: {
        id: row.authorId,
        name: row.authorName,
        avatarUrl: row.authorAvatarUrl,
        role: row.authorRole as UserRole,
      },
    };
    const parentId = row.parentId!;
    if (!replyMap.has(parentId)) replyMap.set(parentId, []);
    replyMap.get(parentId)!.push(reply);
  }

  // 5. Assemble threaded comments
  const comments: ThreadedComment[] = topLevelRows.map((row) => ({
    id: row.id,
    body: row.body,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
    author: {
      id: row.authorId,
      name: row.authorName,
      avatarUrl: row.authorAvatarUrl,
      role: row.authorRole as UserRole,
    },
    replies: replyMap.get(row.id) ?? [],
  }));

  return { comments, total };
}

export function getCommentById(commentId: number) {
  return db
    .select()
    .from(lessonComments)
    .where(eq(lessonComments.id, commentId))
    .get();
}

// ─── Mutations ───

export function createComment(lessonId: number, userId: number, body: string) {
  return db
    .insert(lessonComments)
    .values({ lessonId, userId, body, parentId: null })
    .returning()
    .get();
}

export function createReply(
  lessonId: number,
  userId: number,
  parentId: number,
  body: string
) {
  return db
    .insert(lessonComments)
    .values({ lessonId, userId, body, parentId })
    .returning()
    .get();
}

export function editComment(commentId: number, body: string) {
  return db
    .update(lessonComments)
    .set({ body, updatedAt: new Date().toISOString() })
    .where(eq(lessonComments.id, commentId))
    .returning()
    .get();
}

export function softDeleteComment(commentId: number) {
  return db
    .update(lessonComments)
    .set({ deletedAt: new Date().toISOString() })
    .where(eq(lessonComments.id, commentId))
    .returning()
    .get();
}

export function restoreComment(commentId: number) {
  return db
    .update(lessonComments)
    .set({ deletedAt: null })
    .where(eq(lessonComments.id, commentId))
    .returning()
    .get();
}
