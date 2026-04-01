import { useState, useEffect } from "react";
import { Link, useFetcher, useNavigate } from "react-router";
import { UserAvatar } from "~/components/user-avatar";
import { Button } from "~/components/ui/button";
import { Textarea } from "~/components/ui/textarea";
import { cn } from "~/lib/utils";
import { CornerDownRight, Pencil, Trash2, RotateCcw } from "lucide-react";
import { UserRole } from "~/db/schema";

// ─── Types ───

type Author = {
  id: number;
  name: string;
  avatarUrl: string | null;
  role: string;
};

type Reply = {
  id: number;
  body: string;
  bodyHtml: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  author: Author;
};

type Comment = Reply & {
  replies: Reply[];
};

type CurrentUser = { id: number; role: string } | null;

interface LessonCommentsProps {
  lessonId: number;
  comments: Comment[];
  commentsTotal: number;
  commentsPage: number;
  currentUser: CurrentUser;
  canPost: boolean;
}

// ─── Helpers ───

function formatRelativeTime(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(isoString).toLocaleDateString();
}

function RoleBadge({ role }: { role: string }) {
  if (role === UserRole.Admin) {
    return (
      <span className="rounded bg-primary/10 px-1.5 py-0.5 text-xs text-primary">
        Admin
      </span>
    );
  }
  if (role === UserRole.Instructor) {
    return (
      <span className="rounded bg-primary/10 px-1.5 py-0.5 text-xs text-primary">
        Instructor
      </span>
    );
  }
  return null;
}

function CommentBody({
  bodyHtml,
  deletedAt,
  isStaff,
}: {
  bodyHtml: string | null;
  deletedAt: string | null;
  isStaff: boolean;
}) {
  if (deletedAt) {
    return (
      <p className="text-sm italic text-muted-foreground">
        {isStaff
          ? "This comment has been deleted and is hidden from students."
          : "This comment has been deleted."}
      </p>
    );
  }
  if (bodyHtml) {
    return (
      <div
        className="prose prose-sm dark:prose-invert max-w-none"
        // bodyHtml is server-rendered via renderMarkdown (trusted content)
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: bodyHtml }}
      />
    );
  }
  return null;
}

// ─── Sub-forms ───

function EditForm({
  commentId,
  initialBody,
  fetcher,
  onCancel,
}: {
  commentId: number;
  initialBody: string;
  fetcher: ReturnType<typeof useFetcher>;
  onCancel: () => void;
}) {
  const [body, setBody] = useState(initialBody);
  const isSubmitting = fetcher.state !== "idle";

  return (
    <fetcher.Form method="post" className="mt-2 space-y-2">
      <input type="hidden" name="intent" value="edit-comment" />
      <input type="hidden" name="commentId" value={commentId} />
      <Textarea
        name="body"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={3}
        className="text-sm"
        autoFocus
      />
      <div className="flex items-center gap-2">
        <Button
          type="submit"
          size="sm"
          disabled={!body.trim() || isSubmitting}
        >
          Save
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={onCancel}
          disabled={isSubmitting}
        >
          Cancel
        </Button>
      </div>
    </fetcher.Form>
  );
}

function ReplyForm({
  parentId,
  fetcher,
  onCancel,
}: {
  parentId: number;
  fetcher: ReturnType<typeof useFetcher>;
  onCancel: () => void;
}) {
  const [body, setBody] = useState("");
  const isSubmitting = fetcher.state !== "idle";

  // Clear on successful submission
  useEffect(() => {
    const d = fetcher.data as Record<string, unknown> | undefined;
    if (fetcher.state === "idle" && d?.reply) {
      setBody("");
    }
  }, [fetcher.state, fetcher.data]);

  return (
    <fetcher.Form method="post" className="mt-3 space-y-2">
      <input type="hidden" name="intent" value="create-reply" />
      <input type="hidden" name="parentId" value={parentId} />
      <Textarea
        name="body"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Write a reply…"
        rows={3}
        className="text-sm"
        autoFocus
      />
      <div className="flex items-center gap-2">
        <Button
          type="submit"
          size="sm"
          disabled={!body.trim() || isSubmitting}
        >
          Reply
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={onCancel}
          disabled={isSubmitting}
        >
          Cancel
        </Button>
      </div>
    </fetcher.Form>
  );
}

// ─── Comment card ───

function CommentCard({
  comment,
  currentUser,
  canPost,
  isReply = false,
  fetcher,
  editingId,
  replyingToId,
  onEditStart,
  onEditCancel,
  onReplyStart,
  onReplyCancel,
}: {
  comment: Comment | Reply;
  currentUser: CurrentUser;
  canPost: boolean;
  isReply?: boolean;
  fetcher: ReturnType<typeof useFetcher>;
  editingId: number | null;
  replyingToId: number | null;
  onEditStart: (id: number) => void;
  onEditCancel: () => void;
  onReplyStart: (id: number) => void;
  onReplyCancel: () => void;
}) {
  const isStaff =
    currentUser?.role === UserRole.Instructor ||
    currentUser?.role === UserRole.Admin;
  const isAuthor = currentUser?.id === comment.author.id;
  const canEdit = isAuthor && !comment.deletedAt;
  const canDelete = (isAuthor || isStaff) && !comment.deletedAt;
  const canRestore = isStaff && !!comment.deletedAt;
  const showActions = (isStaff || !comment.deletedAt) && editingId !== comment.id;
  const isEditing = editingId === comment.id;
  const isReplying = !isReply && replyingToId === comment.id;

  return (
    <div className="flex items-start gap-3">
      <UserAvatar
        name={comment.author.name}
        avatarUrl={comment.author.avatarUrl}
        className="mt-0.5 shrink-0"
      />
      <div className="min-w-0 flex-1">
        {/* Author line */}
        <div className="mb-1 flex flex-wrap items-center gap-1.5">
          <span className="text-sm font-medium">{comment.author.name}</span>
          <RoleBadge role={comment.author.role} />
          <span className="text-xs text-muted-foreground">
            {formatRelativeTime(comment.createdAt)}
          </span>
          {comment.updatedAt !== comment.createdAt && !comment.deletedAt && (
            <span className="text-xs text-muted-foreground">(edited)</span>
          )}
        </div>

        {/* Body or edit form */}
        {isEditing ? (
          <EditForm
            commentId={comment.id}
            initialBody={comment.body}
            fetcher={fetcher}
            onCancel={onEditCancel}
          />
        ) : (
          <CommentBody bodyHtml={comment.bodyHtml} deletedAt={comment.deletedAt} isStaff={isStaff} />
        )}

        {/* Action row */}
        {showActions && (
          <div className="mt-2 flex items-center gap-4">
            {canPost && !isReply && (
              <button
                type="button"
                onClick={() => onReplyStart(comment.id)}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                <CornerDownRight className="size-3" />
                Reply
              </button>
            )}
            {canEdit && (
              <button
                type="button"
                onClick={() => onEditStart(comment.id)}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                <Pencil className="size-3" />
                Edit
              </button>
            )}
            {canDelete && (
              <fetcher.Form method="post" className="inline">
                <input type="hidden" name="intent" value="delete-comment" />
                <input type="hidden" name="commentId" value={comment.id} />
                <button
                  type="submit"
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="size-3" />
                  Delete
                </button>
              </fetcher.Form>
            )}
            {canRestore && (
              <fetcher.Form method="post" className="inline">
                <input type="hidden" name="intent" value="restore-comment" />
                <input type="hidden" name="commentId" value={comment.id} />
                <button
                  type="submit"
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  <RotateCcw className="size-3" />
                  Restore
                </button>
              </fetcher.Form>
            )}
          </div>
        )}

        {/* Reply form */}
        {isReplying && (
          <ReplyForm
            parentId={comment.id}
            fetcher={fetcher}
            onCancel={onReplyCancel}
          />
        )}

        {/* Replies (only on top-level comments) */}
        {"replies" in comment && comment.replies.length > 0 && (
          <div className="mt-4 space-y-4 border-l-2 border-border pl-4">
            {comment.replies.map((reply) => (
              <CommentCard
                key={reply.id}
                comment={reply}
                currentUser={currentUser}
                canPost={canPost}
                isReply
                fetcher={fetcher}
                editingId={editingId}
                replyingToId={replyingToId}
                onEditStart={onEditStart}
                onEditCancel={onEditCancel}
                onReplyStart={onReplyStart}
                onReplyCancel={onReplyCancel}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Root component ───

export function LessonComments({
  comments,
  commentsTotal,
  commentsPage,
  currentUser,
  canPost,
}: LessonCommentsProps) {
  const fetcher = useFetcher({ key: "lesson-comment" });
  const navigate = useNavigate();

  const [newBody, setNewBody] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [replyingToId, setReplyingToId] = useState<number | null>(null);

  const isSubmitting = fetcher.state !== "idle";
  const totalPages = Math.ceil(commentsTotal / 10);

  // Clear new comment form and go to page 1 after successful post
  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.comment) {
      setNewBody("");
      // Navigate to first page to show the new comment
      navigate("?page=1", { replace: true });
    }
  }, [fetcher.state, fetcher.data, navigate]);

  // Clear edit/reply mode after successful mutation
  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data) {
      setEditingId(null);
      setReplyingToId(null);
    }
  }, [fetcher.state, fetcher.data]);

  return (
    <section>
      <h2 className="mb-6 text-lg font-semibold">
        Discussion{" "}
        {commentsTotal > 0 && (
          <span className="text-sm font-normal text-muted-foreground">
            ({commentsTotal})
          </span>
        )}
      </h2>

      {/* New comment form */}
      {canPost && currentUser && (
        <fetcher.Form method="post" className="mb-8">
          <input type="hidden" name="intent" value="create-comment" />
          <div className="space-y-2">
            <Textarea
              name="body"
              value={newBody}
              onChange={(e) => setNewBody(e.target.value)}
              placeholder="Ask a question or share what you learned… (Markdown supported)"
              rows={4}
            />
            <Button
              type="submit"
              size="sm"
              disabled={!newBody.trim() || isSubmitting}
            >
              Post Comment
            </Button>
          </div>
        </fetcher.Form>
      )}

      {/* Comment list */}
      {comments.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No comments yet.{canPost ? " Be the first!" : ""}
        </p>
      ) : (
        <div className="space-y-6">
          {comments.map((comment) => (
            <CommentCard
              key={comment.id}
              comment={comment}
              currentUser={currentUser}
              canPost={canPost}
              fetcher={fetcher}
              editingId={editingId}
              replyingToId={replyingToId}
              onEditStart={(id) => {
                setEditingId(id);
                setReplyingToId(null);
              }}
              onEditCancel={() => setEditingId(null)}
              onReplyStart={(id) => {
                setReplyingToId(id);
                setEditingId(null);
              }}
              onReplyCancel={() => setReplyingToId(null)}
            />
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <nav
          className="mt-8 flex items-center justify-between border-t pt-4 text-sm"
          aria-label="Comment pagination"
        >
          {commentsPage > 1 ? (
            <Link
              to={`?page=${commentsPage - 1}`}
              className="text-muted-foreground hover:text-foreground"
            >
              ← Previous
            </Link>
          ) : (
            <span />
          )}
          <span className="text-muted-foreground">
            Page {commentsPage} of {totalPages}
          </span>
          {commentsPage < totalPages ? (
            <Link
              to={`?page=${commentsPage + 1}`}
              className="text-muted-foreground hover:text-foreground"
            >
              Next →
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </section>
  );
}
