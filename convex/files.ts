"use node";

import {
  query,
  mutation,
  internalMutation,
  internalQuery,
  internalAction,
} from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";

// Extraction status validator
const extractionStatusValidator = v.union(
  v.literal("pending"),
  v.literal("processing"),
  v.literal("completed"),
  v.literal("failed")
);

// Source type validator
const sourceTypeValidator = v.union(
  v.literal("upload"),
  v.literal("youtube"),
  v.literal("webpage"),
  v.literal("github")
);

// Full file validator for returns
const fileValidator = v.object({
  _id: v.id("files"),
  _creationTime: v.number(),
  fileName: v.string(),
  mimeType: v.string(),
  fileSize: v.number(),
  driveFileId: v.string(),
  driveWebViewLink: v.optional(v.string()),
  textContent: v.optional(v.string()),
  extractionStatus: extractionStatusValidator,
  sourceType: sourceTypeValidator,
  sourceUrl: v.optional(v.string()),
  tags: v.array(v.string()),
  createdAt: v.number(),
});

const GOOGLE_DRIVE_API = "https://www.googleapis.com/upload/drive/v3";
const GOOGLE_DRIVE_FILES_API = "https://www.googleapis.com/drive/v3";
const OPENROUTER_API = "https://openrouter.ai/api/v1";

// ============================================
// Public Queries
// ============================================

/**
 * List all files ordered by creation date (newest first).
 */
export const list = query({
  args: {
    limit: v.optional(v.number()),
    sourceType: v.optional(sourceTypeValidator),
  },
  returns: v.array(fileValidator),
  handler: async (ctx, args) => {
    const limit = args.limit ?? 50;

    let files;
    if (args.sourceType) {
      files = await ctx.db
        .query("files")
        .withIndex("by_sourceType", (q) => q.eq("sourceType", args.sourceType!))
        .order("desc")
        .take(limit);
    } else {
      files = await ctx.db
        .query("files")
        .withIndex("by_createdAt")
        .order("desc")
        .take(limit);
    }

    return files;
  },
});

/**
 * Get a single file by ID.
 */
export const get = query({
  args: {
    id: v.id("files"),
  },
  returns: v.union(fileValidator, v.null()),
  handler: async (ctx, args) => {
    const file = await ctx.db.get(args.id);
    return file ?? null;
  },
});

/**
 * Search files by filename or content.
 */
export const search = query({
  args: {
    query: v.string(),
  },
  returns: v.array(fileValidator),
  handler: async (ctx, args) => {
    const searchTerm = args.query.toLowerCase().trim();
    if (!searchTerm) {
      return [];
    }

    const files = await ctx.db.query("files").collect();

    return files
      .filter(
        (f) =>
          f.fileName.toLowerCase().includes(searchTerm) ||
          (f.textContent && f.textContent.toLowerCase().includes(searchTerm))
      )
      .slice(0, 20);
  },
});

/**
 * Get files by tag.
 */
export const getByTag = query({
  args: {
    tag: v.string(),
  },
  returns: v.array(fileValidator),
  handler: async (ctx, args) => {
    const normalizedTag = args.tag.toLowerCase().trim();

    const files = await ctx.db.query("files").collect();

    return files.filter((f) => f.tags.includes(normalizedTag));
  },
});

/**
 * Get files by extraction status.
 */
export const getByExtractionStatus = query({
  args: {
    status: extractionStatusValidator,
  },
  returns: v.array(fileValidator),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("files")
      .withIndex("by_extractionStatus", (q) =>
        q.eq("extractionStatus", args.status)
      )
      .collect();
  },
});

// ============================================
// Public Mutations
// ============================================

/**
 * Create a file record after uploading to Google Drive.
 */
export const create = mutation({
  args: {
    fileName: v.string(),
    mimeType: v.string(),
    fileSize: v.number(),
    driveFileId: v.string(),
    driveWebViewLink: v.optional(v.string()),
    sourceType: sourceTypeValidator,
    sourceUrl: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
  },
  returns: v.id("files"),
  handler: async (ctx, args) => {
    const now = Date.now();
    const tags = args.tags ?? [];

    // Process tags
    if (tags.length > 0) {
      await ctx.scheduler.runAfter(0, internal.tags.incrementUsage, {
        tagNames: tags,
      });
    }

    const fileId = await ctx.db.insert("files", {
      fileName: args.fileName,
      mimeType: args.mimeType,
      fileSize: args.fileSize,
      driveFileId: args.driveFileId,
      driveWebViewLink: args.driveWebViewLink,
      extractionStatus: "pending",
      sourceType: args.sourceType,
      sourceUrl: args.sourceUrl,
      tags,
      createdAt: now,
    });

    // Schedule content extraction based on type
    await ctx.scheduler.runAfter(0, internal.files.startExtraction, {
      fileId,
    });

    return fileId;
  },
});

/**
 * Create a file from a URL (YouTube, webpage, GitHub).
 */
export const createFromUrl = mutation({
  args: {
    url: v.string(),
    tags: v.optional(v.array(v.string())),
  },
  returns: v.id("files"),
  handler: async (ctx, args) => {
    const now = Date.now();
    const tags = args.tags ?? [];
    const url = args.url.trim();

    // Determine source type from URL
    let sourceType: "youtube" | "webpage" | "github" = "webpage";
    let fileName = url;

    if (
      url.includes("youtube.com") ||
      url.includes("youtu.be")
    ) {
      sourceType = "youtube";
      // Extract video ID for display
      const videoId = extractYouTubeVideoId(url);
      fileName = `YouTube: ${videoId || url}`;
    } else if (url.includes("github.com")) {
      sourceType = "github";
      // Extract repo name for display
      const repoMatch = url.match(/github\.com\/([^/]+\/[^/]+)/);
      fileName = repoMatch ? `GitHub: ${repoMatch[1]}` : url;
    } else {
      // Extract domain for display
      try {
        const domain = new URL(url).hostname;
        fileName = `Web: ${domain}`;
      } catch {
        fileName = url;
      }
    }

    // Process tags
    if (tags.length > 0) {
      await ctx.scheduler.runAfter(0, internal.tags.incrementUsage, {
        tagNames: tags,
      });
    }

    // For URL-based content, we create a placeholder Drive file ID
    // The actual content will be fetched and stored during extraction
    const fileId = await ctx.db.insert("files", {
      fileName,
      mimeType: "text/plain",
      fileSize: 0,
      driveFileId: `url:${url}`, // Placeholder until extraction
      extractionStatus: "pending",
      sourceType,
      sourceUrl: url,
      tags,
      createdAt: now,
    });

    // Schedule content extraction
    await ctx.scheduler.runAfter(0, internal.files.startExtraction, {
      fileId,
    });

    return fileId;
  },
});

/**
 * Update a file's metadata.
 */
export const update = mutation({
  args: {
    id: v.id("files"),
    fileName: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const file = await ctx.db.get(args.id);
    if (!file) {
      throw new Error("File not found");
    }

    const updates: {
      fileName?: string;
      tags?: string[];
    } = {};

    if (args.fileName !== undefined) updates.fileName = args.fileName;

    // Handle tag changes
    if (args.tags !== undefined) {
      const oldTags = file.tags;
      const newTags = args.tags;

      // Find removed tags
      const removedTags = oldTags.filter((t) => !newTags.includes(t));
      if (removedTags.length > 0) {
        await ctx.scheduler.runAfter(0, internal.tags.decrementUsage, {
          tagNames: removedTags,
        });
      }

      // Find added tags
      const addedTags = newTags.filter((t) => !oldTags.includes(t));
      if (addedTags.length > 0) {
        await ctx.scheduler.runAfter(0, internal.tags.incrementUsage, {
          tagNames: addedTags,
        });
      }

      updates.tags = newTags;
    }

    await ctx.db.patch(args.id, updates);

    return null;
  },
});

/**
 * Delete a file.
 */
export const remove = mutation({
  args: {
    id: v.id("files"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const file = await ctx.db.get(args.id);
    if (!file) {
      throw new Error("File not found");
    }

    // Decrement tag usage
    if (file.tags.length > 0) {
      await ctx.scheduler.runAfter(0, internal.tags.decrementUsage, {
        tagNames: file.tags,
      });
    }

    // Schedule Google Drive file deletion if it's a real Drive file
    if (file.driveFileId && !file.driveFileId.startsWith("url:")) {
      await ctx.scheduler.runAfter(0, internal.files.deleteFromDrive, {
        driveFileId: file.driveFileId,
      });
    }

    await ctx.db.delete(args.id);

    return null;
  },
});

/**
 * Retry extraction for a failed file.
 */
export const retryExtraction = mutation({
  args: {
    id: v.id("files"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const file = await ctx.db.get(args.id);
    if (!file) {
      throw new Error("File not found");
    }

    if (file.extractionStatus !== "failed") {
      throw new Error("Can only retry failed extractions");
    }

    // Reset status to pending
    await ctx.db.patch(args.id, {
      extractionStatus: "pending",
    });

    // Schedule extraction
    await ctx.scheduler.runAfter(0, internal.files.startExtraction, {
      fileId: args.id,
    });

    return null;
  },
});

// ============================================
// Internal Functions
// ============================================

/**
 * Internal: Get file for extraction.
 */
export const getFile = internalQuery({
  args: {
    fileId: v.id("files"),
  },
  returns: v.union(fileValidator, v.null()),
  handler: async (ctx, args) => {
    return await ctx.db.get(args.fileId);
  },
});

/**
 * Internal: Update extraction status.
 */
export const updateExtractionStatus = internalMutation({
  args: {
    fileId: v.id("files"),
    status: extractionStatusValidator,
    textContent: v.optional(v.string()),
    driveFileId: v.optional(v.string()),
    driveWebViewLink: v.optional(v.string()),
    fileSize: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const updates: {
      extractionStatus: "pending" | "processing" | "completed" | "failed";
      textContent?: string;
      driveFileId?: string;
      driveWebViewLink?: string;
      fileSize?: number;
    } = {
      extractionStatus: args.status,
    };

    if (args.textContent !== undefined) updates.textContent = args.textContent;
    if (args.driveFileId !== undefined) updates.driveFileId = args.driveFileId;
    if (args.driveWebViewLink !== undefined)
      updates.driveWebViewLink = args.driveWebViewLink;
    if (args.fileSize !== undefined) updates.fileSize = args.fileSize;

    await ctx.db.patch(args.fileId, updates);

    return null;
  },
});

/**
 * Internal: Start extraction process.
 */
export const startExtraction = internalAction({
  args: {
    fileId: v.id("files"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    // Update status to processing
    await ctx.runMutation(internal.files.updateExtractionStatus, {
      fileId: args.fileId,
      status: "processing",
    });

    // Get file details
    const file = await ctx.runQuery(internal.files.getFile, {
      fileId: args.fileId,
    });

    if (!file) {
      return null;
    }

    try {
      let textContent: string | null = null;

      switch (file.sourceType) {
        case "youtube":
          textContent = await extractYouTubeTranscript(file.sourceUrl || "");
          break;

        case "webpage":
          textContent = await extractWebpageContent(file.sourceUrl || "");
          break;

        case "github":
          textContent = await extractGitHubContent(file.sourceUrl || "");
          break;

        case "upload":
          // For uploaded files, check if it's an image and needs vision processing
          if (file.mimeType.startsWith("image/")) {
            textContent = await generateImageDescription(
              file.driveFileId,
              ctx
            );
          }
          // For other file types (PDF, docs), extraction happens client-side
          // and textContent is provided separately
          break;
      }

      if (textContent !== null) {
        // Update with successful extraction
        await ctx.runMutation(internal.files.updateExtractionStatus, {
          fileId: args.fileId,
          status: "completed",
          textContent,
        });

        // Index in RAG
        await ctx.runMutation(internal.files.indexInRag, {
          fileId: args.fileId,
          textContent,
          fileName: file.fileName,
          sourceType: file.sourceType,
          tags: file.tags,
        });
      } else if (file.sourceType === "upload" && !file.mimeType.startsWith("image/")) {
        // For non-image uploads, mark as completed without extracted text
        // Text will be provided separately by client-side extraction
        await ctx.runMutation(internal.files.updateExtractionStatus, {
          fileId: args.fileId,
          status: "completed",
        });
      } else {
        await ctx.runMutation(internal.files.updateExtractionStatus, {
          fileId: args.fileId,
          status: "failed",
        });
      }
    } catch (error) {
      console.error("Extraction error:", error);
      await ctx.runMutation(internal.files.updateExtractionStatus, {
        fileId: args.fileId,
        status: "failed",
      });
    }

    return null;
  },
});

/**
 * Internal: Upload file to Google Drive.
 */
export const uploadToDrive = internalAction({
  args: {
    fileData: v.array(v.number()), // Uint8Array as number array
    fileName: v.string(),
    mimeType: v.string(),
  },
  returns: v.object({
    success: v.boolean(),
    driveFileId: v.optional(v.string()),
    driveWebViewLink: v.optional(v.string()),
    error: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    const tokenResult = await ctx.runAction(
      internal.googleActions.getValidAccessToken,
      {}
    );

    if (!tokenResult.success) {
      return { success: false, error: tokenResult.error };
    }

    const accessToken = tokenResult.accessToken;

    try {
      // Create file metadata
      const metadata = {
        name: args.fileName,
        mimeType: args.mimeType,
      };

      // Convert number array back to Uint8Array
      const fileBytes = new Uint8Array(args.fileData);

      // Create multipart upload
      const boundary = "kriyan_upload_boundary";
      const delimiter = `\r\n--${boundary}\r\n`;
      const closeDelimiter = `\r\n--${boundary}--`;

      const metadataString = JSON.stringify(metadata);

      const encoder = new TextEncoder();
      const metaPart = encoder.encode(
        `${delimiter}Content-Type: application/json; charset=UTF-8\r\n\r\n${metadataString}${delimiter}Content-Type: ${args.mimeType}\r\nContent-Transfer-Encoding: base64\r\n\r\n`
      );
      const base64File = Buffer.from(fileBytes).toString("base64");
      const filePart = encoder.encode(base64File);
      const closePart = encoder.encode(closeDelimiter);

      const body = new Uint8Array(
        metaPart.length + filePart.length + closePart.length
      );
      body.set(metaPart, 0);
      body.set(filePart, metaPart.length);
      body.set(closePart, metaPart.length + filePart.length);

      const response = await fetch(
        `${GOOGLE_DRIVE_API}/files?uploadType=multipart&fields=id,webViewLink`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": `multipart/related; boundary=${boundary}`,
          },
          body: body,
        }
      );

      if (!response.ok) {
        const error = await response.text();
        return { success: false, error: `Drive upload failed: ${error}` };
      }

      const result = (await response.json()) as {
        id: string;
        webViewLink?: string;
      };

      return {
        success: true,
        driveFileId: result.id,
        driveWebViewLink: result.webViewLink,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  },
});

/**
 * Internal: Delete file from Google Drive.
 */
export const deleteFromDrive = internalAction({
  args: {
    driveFileId: v.string(),
  },
  returns: v.object({
    success: v.boolean(),
    error: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    const tokenResult = await ctx.runAction(
      internal.googleActions.getValidAccessToken,
      {}
    );

    if (!tokenResult.success) {
      return { success: false, error: tokenResult.error };
    }

    const accessToken = tokenResult.accessToken;

    try {
      const response = await fetch(
        `${GOOGLE_DRIVE_FILES_API}/files/${args.driveFileId}`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );

      // 204 No Content or 404 Not Found are acceptable
      if (!response.ok && response.status !== 204 && response.status !== 404) {
        const error = await response.text();
        return { success: false, error: `Drive delete failed: ${error}` };
      }

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  },
});

/**
 * Internal: Index file content in RAG.
 */
export const indexInRag = internalMutation({
  args: {
    fileId: v.id("files"),
    textContent: v.string(),
    fileName: v.string(),
    sourceType: sourceTypeValidator,
    tags: v.array(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    // TODO: Implement RAG indexing when component is configured
    // Example:
    // await rag.insert(ctx, {
    //   content: args.textContent,
    //   metadata: {
    //     sourceType: "file",
    //     sourceId: args.fileId,
    //     fileName: args.fileName,
    //     fileSourceType: args.sourceType,
    //     tags: args.tags,
    //   },
    // });

    console.log(
      `Indexed file ${args.fileId} content in RAG (placeholder)`
    );

    return null;
  },
});

/**
 * Update file with extracted text content (called from client after extraction).
 */
export const updateTextContent = mutation({
  args: {
    id: v.id("files"),
    textContent: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const file = await ctx.db.get(args.id);
    if (!file) {
      throw new Error("File not found");
    }

    await ctx.db.patch(args.id, {
      textContent: args.textContent,
      extractionStatus: "completed",
    });

    // Index in RAG
    await ctx.scheduler.runAfter(0, internal.files.indexInRag, {
      fileId: args.id,
      textContent: args.textContent,
      fileName: file.fileName,
      sourceType: file.sourceType,
      tags: file.tags,
    });

    return null;
  },
});

// ============================================
// Helper Functions
// ============================================

/**
 * Extract YouTube video ID from URL.
 */
function extractYouTubeVideoId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\n?#]+)/,
    /youtube\.com\/embed\/([^&\n?#]+)/,
    /youtube\.com\/v\/([^&\n?#]+)/,
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) {
      return match[1];
    }
  }

  return null;
}

/**
 * Extract YouTube transcript using various methods.
 */
async function extractYouTubeTranscript(url: string): Promise<string | null> {
  const videoId = extractYouTubeVideoId(url);
  if (!videoId) {
    console.error("Could not extract video ID from URL:", url);
    return null;
  }

  try {
    // Method 1: Try YouTube's timedtext API (may not always work)
    const transcriptUrl = `https://www.youtube.com/api/timedtext?v=${videoId}&lang=en&fmt=srv3`;
    const response = await fetch(transcriptUrl);

    if (response.ok) {
      const xml = await response.text();
      // Parse XML to extract text
      const textMatches = xml.match(/<text[^>]*>([^<]+)<\/text>/g);
      if (textMatches) {
        const transcript = textMatches
          .map((match) => {
            const textMatch = match.match(/<text[^>]*>([^<]+)<\/text>/);
            return textMatch ? textMatch[1] : "";
          })
          .join(" ")
          .replace(/&#39;/g, "'")
          .replace(/&amp;/g, "&")
          .replace(/&quot;/g, '"')
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">");

        if (transcript.length > 0) {
          return transcript;
        }
      }
    }

    // Method 2: Try fetching video page and extracting captions data
    const videoPageResponse = await fetch(
      `https://www.youtube.com/watch?v=${videoId}`,
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
      }
    );

    if (videoPageResponse.ok) {
      const html = await videoPageResponse.text();

      // Try to extract captions URL from page
      const captionsMatch = html.match(
        /"captions":\s*\{[^}]*"playerCaptionsTracklistRenderer":\s*\{[^}]*"captionTracks":\s*\[([^\]]+)\]/
      );

      if (captionsMatch) {
        const captionsData = captionsMatch[1];
        const urlMatch = captionsData.match(/"baseUrl":\s*"([^"]+)"/);

        if (urlMatch) {
          const captionsUrl = urlMatch[1]
            .replace(/\\u0026/g, "&")
            .replace(/\\/g, "");
          const captionsResponse = await fetch(captionsUrl);

          if (captionsResponse.ok) {
            const captionsXml = await captionsResponse.text();
            const textMatches = captionsXml.match(/<text[^>]*>([^<]*)<\/text>/g);

            if (textMatches) {
              const transcript = textMatches
                .map((match) => {
                  const textMatch = match.match(/<text[^>]*>([^<]*)<\/text>/);
                  return textMatch ? textMatch[1] : "";
                })
                .join(" ")
                .replace(/&#39;/g, "'")
                .replace(/&amp;/g, "&");

              if (transcript.length > 0) {
                return `YouTube Video Transcript:\n\n${transcript}`;
              }
            }
          }
        }
      }

      // Fallback: Extract video title and description
      const titleMatch = html.match(/<title>([^<]+)<\/title>/);
      const descMatch = html.match(
        /"description":\s*\{"simpleText":\s*"([^"]+)"\}/
      );

      let content = "";
      if (titleMatch) {
        content += `Title: ${titleMatch[1].replace(" - YouTube", "")}\n\n`;
      }
      if (descMatch) {
        content += `Description: ${descMatch[1]}\n\n`;
      }

      if (content.length > 0) {
        content +=
          "(Note: Full transcript could not be extracted. Only metadata available.)";
        return content;
      }
    }

    return null;
  } catch (error) {
    console.error("YouTube transcript extraction error:", error);
    return null;
  }
}

/**
 * Extract webpage content using basic HTML parsing.
 */
async function extractWebpageContent(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });

    if (!response.ok) {
      console.error("Webpage fetch failed:", response.status);
      return null;
    }

    const html = await response.text();

    // Extract title
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const title = titleMatch ? titleMatch[1].trim() : "";

    // Extract meta description
    const descMatch = html.match(
      /<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i
    );
    const description = descMatch ? descMatch[1].trim() : "";

    // Remove scripts, styles, and HTML tags to get text content
    let textContent = html
      // Remove scripts
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      // Remove styles
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      // Remove HTML comments
      .replace(/<!--[\s\S]*?-->/g, "")
      // Remove head section
      .replace(/<head[^>]*>[\s\S]*?<\/head>/gi, "")
      // Remove navigation and footer
      .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, "")
      .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, "")
      .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, "")
      // Convert line breaks
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n\n")
      .replace(/<\/div>/gi, "\n")
      .replace(/<\/h[1-6]>/gi, "\n\n")
      .replace(/<\/li>/gi, "\n")
      // Remove remaining HTML tags
      .replace(/<[^>]+>/g, " ")
      // Decode HTML entities
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&#x27;/g, "'")
      // Clean up whitespace
      .replace(/\s+/g, " ")
      .replace(/\n\s*\n/g, "\n\n")
      .trim();

    // Limit content length
    if (textContent.length > 50000) {
      textContent = textContent.substring(0, 50000) + "...";
    }

    let result = "";
    if (title) result += `Title: ${title}\n\n`;
    if (description) result += `Description: ${description}\n\n`;
    result += `Content:\n${textContent}`;

    return result;
  } catch (error) {
    console.error("Webpage extraction error:", error);
    return null;
  }
}

/**
 * Extract GitHub repository content.
 */
async function extractGitHubContent(url: string): Promise<string | null> {
  try {
    // Parse GitHub URL
    const match = url.match(/github\.com\/([^/]+)\/([^/]+)/);
    if (!match) {
      console.error("Invalid GitHub URL:", url);
      return null;
    }

    const [, owner, repo] = match;
    const repoName = repo.replace(/\.git$/, "");

    // Fetch repository info
    const repoResponse = await fetch(
      `https://api.github.com/repos/${owner}/${repoName}`,
      {
        headers: {
          Accept: "application/vnd.github.v3+json",
          "User-Agent": "Kriyan-App",
        },
      }
    );

    if (!repoResponse.ok) {
      console.error("GitHub API error:", repoResponse.status);
      return null;
    }

    const repoData = (await repoResponse.json()) as {
      full_name: string;
      description: string;
      language: string;
      stargazers_count: number;
      forks_count: number;
      topics: string[];
      default_branch: string;
    };

    let content = `# GitHub Repository: ${repoData.full_name}\n\n`;

    if (repoData.description) {
      content += `## Description\n${repoData.description}\n\n`;
    }

    content += `## Stats\n`;
    content += `- Language: ${repoData.language || "Not specified"}\n`;
    content += `- Stars: ${repoData.stargazers_count}\n`;
    content += `- Forks: ${repoData.forks_count}\n`;

    if (repoData.topics && repoData.topics.length > 0) {
      content += `- Topics: ${repoData.topics.join(", ")}\n`;
    }

    content += "\n";

    // Try to fetch README
    const readmeResponse = await fetch(
      `https://api.github.com/repos/${owner}/${repoName}/readme`,
      {
        headers: {
          Accept: "application/vnd.github.v3+json",
          "User-Agent": "Kriyan-App",
        },
      }
    );

    if (readmeResponse.ok) {
      const readmeData = (await readmeResponse.json()) as {
        content: string;
        encoding: string;
      };

      if (readmeData.encoding === "base64" && readmeData.content) {
        const readmeContent = Buffer.from(
          readmeData.content,
          "base64"
        ).toString("utf-8");
        content += `## README\n\n${readmeContent}\n\n`;
      }
    }

    // Fetch file tree (limited)
    const treeResponse = await fetch(
      `https://api.github.com/repos/${owner}/${repoName}/git/trees/${repoData.default_branch}?recursive=1`,
      {
        headers: {
          Accept: "application/vnd.github.v3+json",
          "User-Agent": "Kriyan-App",
        },
      }
    );

    if (treeResponse.ok) {
      const treeData = (await treeResponse.json()) as {
        tree: Array<{ path: string; type: string }>;
        truncated: boolean;
      };

      content += `## File Structure\n\`\`\`\n`;

      // Limit to first 100 files
      const files = treeData.tree
        .filter((item) => item.type === "blob")
        .slice(0, 100);

      for (const file of files) {
        content += `${file.path}\n`;
      }

      if (treeData.truncated || treeData.tree.length > 100) {
        content += `... (truncated)\n`;
      }

      content += `\`\`\`\n`;
    }

    return content;
  } catch (error) {
    console.error("GitHub extraction error:", error);
    return null;
  }
}

/**
 * Generate image description using GPT-4o Vision.
 */
async function generateImageDescription(
  driveFileId: string,
  ctx: {
    runAction: (
      ref: typeof internal.googleActions.getValidAccessToken,
      args: Record<string, never>
    ) => Promise<{ success: true; accessToken: string } | { success: false; error: string }>;
  }
): Promise<string | null> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    console.error("OPENROUTER_API_KEY not configured");
    return null;
  }

  try {
    // Get access token for Google Drive
    const tokenResult = await ctx.runAction(
      internal.googleActions.getValidAccessToken,
      {}
    );

    if (!tokenResult.success) {
      console.error("Failed to get Google access token");
      return null;
    }

    // Download image from Google Drive
    const response = await fetch(
      `${GOOGLE_DRIVE_FILES_API}/files/${driveFileId}?alt=media`,
      {
        headers: {
          Authorization: `Bearer ${tokenResult.accessToken}`,
        },
      }
    );

    if (!response.ok) {
      console.error("Failed to download image from Drive");
      return null;
    }

    const imageBuffer = await response.arrayBuffer();
    const base64Image = Buffer.from(imageBuffer).toString("base64");
    const mimeType = response.headers.get("content-type") || "image/jpeg";

    // Call GPT-4o Vision via OpenRouter
    const visionResponse = await fetch(`${OPENROUTER_API}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://kriyan.app",
        "X-Title": "Kriyan Files",
      },
      body: JSON.stringify({
        model: "openai/gpt-4o",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Please describe this image in detail. Include any text visible in the image, the main subjects, colors, and any relevant context. This description will be used for search and indexing purposes.",
              },
              {
                type: "image_url",
                image_url: {
                  url: `data:${mimeType};base64,${base64Image}`,
                },
              },
            ],
          },
        ],
        max_tokens: 500,
      }),
    });

    if (!visionResponse.ok) {
      const errorText = await visionResponse.text();
      console.error("Vision API error:", errorText);
      return null;
    }

    const visionResult = (await visionResponse.json()) as {
      choices: Array<{ message: { content: string } }>;
    };

    return visionResult.choices?.[0]?.message?.content || null;
  } catch (error) {
    console.error("Image description error:", error);
    return null;
  }
}
