"use client";

import { useState, useRef } from "react";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Id } from "@/convex/_generated/dataModel";

type SourceType = "upload" | "youtube" | "webpage" | "github";
type ExtractionStatus = "pending" | "processing" | "completed" | "failed";

interface FileItem {
  _id: Id<"files">;
  fileName: string;
  mimeType: string;
  fileSize: number;
  driveFileId: string;
  driveWebViewLink?: string;
  textContent?: string;
  extractionStatus: ExtractionStatus;
  sourceType: SourceType;
  sourceUrl?: string;
  tags: string[];
  createdAt: number;
}

const sourceTypeLabels: Record<SourceType, string> = {
  upload: "Upload",
  youtube: "YouTube",
  webpage: "Web",
  github: "GitHub",
};

const statusColors: Record<ExtractionStatus, string> = {
  pending: "bg-warning/20 text-warning",
  processing: "bg-accent/20 text-accent",
  completed: "bg-success/20 text-success",
  failed: "bg-error/20 text-error",
};

export default function FilesPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [filter, setFilter] = useState<SourceType | "all">("all");
  const [showAddModal, setShowAddModal] = useState(false);
  const [linkInput, setLinkInput] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Queries
  const files = useQuery(api.files.list, { limit: 100 }) as FileItem[] | undefined;
  const searchResults = useQuery(
    api.files.search,
    searchQuery.length >= 2 ? { query: searchQuery } : "skip"
  ) as FileItem[] | undefined;

  // Mutations
  const createFromUrl = useMutation(api.files.createFromUrl);
  const removeFile = useMutation(api.files.remove);
  const retryExtraction = useMutation(api.files.retryExtraction);
  const updateTextContent = useMutation(api.files.updateTextContent);
  const uploadFile = useAction(api.files.uploadFile);

  const displayedFiles = searchQuery.length >= 2 ? searchResults : files;
  const filteredFiles = displayedFiles?.filter(
    (f) => filter === "all" || f.sourceType === filter
  );

  const handleAddLink = async () => {
    if (!linkInput.trim()) return;

    setIsAdding(true);
    try {
      await createFromUrl({
        url: linkInput.trim(),
        tags: [],
      });

      setLinkInput("");
      setShowAddModal(false);
    } catch (error) {
      console.error("Failed to add link:", error);
    } finally {
      setIsAdding(false);
    }
  };

  const extractText = async (file: File, arrayBuffer: ArrayBuffer) => {
    if (file.type === "application/pdf") {
      const pdfjs = await import("pdfjs-dist/legacy/build/pdf");
      const version = (pdfjs as { version: string }).version;
      (pdfjs as typeof import("pdfjs-dist/legacy/build/pdf")).GlobalWorkerOptions.workerSrc =
        `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${version}/pdf.worker.min.js`;

      const pdf = await (pdfjs as typeof import("pdfjs-dist/legacy/build/pdf")).getDocument({
        data: arrayBuffer,
      }).promise;

      let text = "";
      for (let i = 1; i <= pdf.numPages; i += 1) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        const pageText = content.items
          .map((item) => ("str" in item ? item.str : ""))
          .join(" ");
        text += `${pageText}\n`;
      }
      return text.trim();
    }

    if (file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
      const mammoth = await import("mammoth");
      const result = await mammoth.extractRawText({ arrayBuffer });
      return result.value.trim();
    }

    if (file.type.startsWith("text/")) {
      return file.text();
    }

    return null;
  };

  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const fileData = Array.from(new Uint8Array(arrayBuffer));

      const result = await uploadFile({
        fileName: file.name,
        mimeType: file.type || "application/octet-stream",
        fileData,
        tags: [],
      });

      if (result.success && result.fileId) {
        const extracted = await extractText(file, arrayBuffer);
        if (extracted) {
          await updateTextContent({
            id: result.fileId,
            textContent: extracted,
          });
        }
      }
    } catch (error) {
      console.error("Failed to upload file:", error);
    } finally {
      setIsUploading(false);
      if (event.target) {
        event.target.value = "";
      }
    }
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString();
  };

  const getFileIcon = (mimeType: string, sourceType: SourceType) => {
    if (sourceType === "youtube") return "🎥";
    if (sourceType === "webpage") return "🌐";
    if (sourceType === "github") return "📦";
    if (mimeType.includes("pdf")) return "📄";
    if (mimeType.includes("image")) return "🖼️";
    if (mimeType.includes("audio")) return "🎵";
    if (mimeType.includes("video")) return "🎬";
    if (mimeType.includes("word") || mimeType.includes("document")) return "📝";
    if (mimeType.includes("sheet") || mimeType.includes("excel")) return "📊";
    if (mimeType.includes("presentation") || mimeType.includes("powerpoint")) return "📽️";
    return "📁";
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Files</h1>
          <p className="text-text-secondary mt-1">
            Manage your documents, links, and media
          </p>
        </div>
        <div className="flex items-center gap-3">
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={handleUpload}
          />
          <Button variant="secondary" onClick={handleUploadClick} disabled={isUploading}>
            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M12 12v8m0-8l-3 3m3-3l3 3M12 4v8" />
            </svg>
            {isUploading ? "Uploading..." : "Upload"}
          </Button>
          <Button onClick={() => setShowAddModal(true)}>
            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Content
          </Button>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="flex gap-4">
        <div className="flex-1">
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search files..."
            className="w-full"
          />
        </div>
        <div className="flex gap-2">
          {(["all", "upload", "youtube", "webpage", "github"] as const).map((type) => (
            <button
              key={type}
              onClick={() => setFilter(type)}
              className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                filter === type
                  ? "bg-primary/20 text-primary"
                  : "text-text-secondary hover:bg-glass-hover"
              }`}
            >
              {type === "all" ? "All" : sourceTypeLabels[type]}
            </button>
          ))}
        </div>
      </div>

      {/* Files Grid */}
      {filteredFiles?.length === 0 ? (
        <div className="text-center py-12">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-glass-hover flex items-center justify-center">
            <svg className="w-8 h-8 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
            </svg>
          </div>
          <p className="text-text-secondary">No files yet</p>
          <p className="text-text-muted text-sm mt-1">Add some content to get started</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredFiles?.map((file) => (
            <Card key={file._id} className="p-4 hover:border-primary/50 transition-colors group">
              <div className="flex items-start gap-3">
                <div className="text-3xl">{getFileIcon(file.mimeType, file.sourceType)}</div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-medium text-text-primary truncate">{file.fileName}</h3>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs text-text-muted">
                      {formatFileSize(file.fileSize)}
                    </span>
                    <span className="text-xs text-text-muted">•</span>
                    <span className="text-xs text-text-muted">
                      {formatDate(file.createdAt)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    <Badge className={statusColors[file.extractionStatus]}>
                      {file.extractionStatus}
                    </Badge>
                    <Badge variant="outline">
                      {sourceTypeLabels[file.sourceType]}
                    </Badge>
                  </div>
                  {file.tags.length > 0 && (
                    <div className="flex gap-1 mt-2 flex-wrap">
                      {file.tags.map((tag) => (
                        <Badge key={tag} variant="secondary" className="text-xs">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              
              {/* Actions */}
              <div className="flex justify-end gap-2 mt-3 opacity-0 group-hover:opacity-100 transition-opacity">
                {file.driveWebViewLink && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => window.open(file.driveWebViewLink, "_blank")}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                  </Button>
                )}
                {file.extractionStatus === "failed" && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => retryExtraction({ id: file._id })}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => removeFile({ id: file._id })}
                  className="text-error hover:bg-error/10"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Add Content Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="glass rounded-xl border border-glass-border p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-text-primary">Add Content</h2>
              <button
                onClick={() => setShowAddModal(false)}
                className="p-1 hover:bg-glass-hover rounded-lg"
              >
                <svg className="w-5 h-5 text-text-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-2">
                  Paste a link (YouTube, Website, or GitHub)
                </label>
                <Input
                  value={linkInput}
                  onChange={(e) => setLinkInput(e.target.value)}
                  placeholder="https://..."
                  onKeyDown={(e) => e.key === "Enter" && handleAddLink()}
                />
              </div>

              <div className="text-xs text-text-muted">
                <p className="font-medium mb-1">Supported content:</p>
                <ul className="space-y-0.5">
                  <li>• YouTube videos (transcripts)</li>
                  <li>• Web articles (text extraction)</li>
                  <li>• GitHub repositories (README + structure)</li>
                </ul>
              </div>

              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setShowAddModal(false)}>
                  Cancel
                </Button>
                <Button onClick={handleAddLink} disabled={!linkInput.trim() || isAdding}>
                  {isAdding ? "Adding..." : "Add"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
