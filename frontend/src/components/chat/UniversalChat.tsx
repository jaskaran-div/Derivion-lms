"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { chatAPI, apiErrorMessage, displayLogin } from "@/lib/api";
import { useAuthStore } from "@/store/authStore";
import toast from "react-hot-toast";
import {
  Send, Search, MessageSquare, User, Shield, GraduationCap, Sparkles, X, Menu, ChevronRight, CheckCheck,
} from "lucide-react";

export interface UserProfile {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  username?: string | null;
  role: "ADMIN" | "TEACHER" | "STUDENT";
  avatar?: string | null;
}

export interface ChatMessageItem {
  id: string;
  threadId: string;
  senderId: string;
  body: string;
  createdAt: string;
  sender?: {
    id: string;
    firstName: string;
    lastName: string;
    role: string;
    email?: string;
  };
}

export interface ConversationItem {
  id: string;
  status: string;
  lastMessageAt: string;
  unreadCount: number;
  partner: UserProfile;
  lastMessage?: {
    body: string;
    createdAt: string;
    senderId: string;
  } | null;
}

export default function UniversalChat({ hint }: { hint?: string }) {
  const { user: currentUser } = useAuthStore();

  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [activePartner, setActivePartner] = useState<UserProfile | null>(null);
  const [messages, setMessages] = useState<ChatMessageItem[]>([]);
  const [text, setText] = useState("");

  const [searchQuery, setSearchQuery] = useState("");
  // Results are tagged with the query they belong to; "searching" means the current query has no results yet
  const [searchState, setSearchState] = useState<{ q: string; results: UserProfile[] }>({ q: "", results: [] });
  const trimmedQuery = searchQuery.trim();
  const searchResults = trimmedQuery && searchState.q === trimmedQuery ? searchState.results : [];
  const searching = Boolean(trimmedQuery) && searchState.q !== trimmedQuery;

  const [loadingConversations, setLoadingConversations] = useState(true);
  // Messages are loading until the active thread's messages have arrived
  const [loadedThreadId, setLoadedThreadId] = useState<string | null>(null);
  const loadingMessages = Boolean(activeThreadId) && loadedThreadId !== activeThreadId;
  const [sending, setSending] = useState(false);

  // Mobile drawer toggle
  const [showRightMenuMobile, setShowRightMenuMobile] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Load user's conversations
  const loadConversations = useCallback(
    () =>
      chatAPI
        .getConversations()
        .then((res) => {
          const convList: ConversationItem[] = res.data.data || [];
          setConversations(convList);
          // Auto-select the first conversation if none is open (its partner arrives with its messages)
          if (convList.length > 0) setActiveThreadId((current) => current ?? convList[0].id);
        })
        .catch((err) => console.error("Failed to load conversations:", err))
        .finally(() => setLoadingConversations(false)),
    []
  );

  // Load messages for the active conversation
  const loadMessages = useCallback(
    (threadId: string) =>
      chatAPI
        .getConversationMessages(threadId)
        .then((res) => {
          const data = res.data.data;
          setMessages(data.messages || []);
          if (data.partner) setActivePartner(data.partner);
        })
        .catch((err) => console.error("Failed to load messages:", err))
        .finally(() => setLoadedThreadId(threadId)),
    []
  );

  // Initial load
  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  // When active conversation changes, fetch its messages
  useEffect(() => {
    if (activeThreadId) {
      loadMessages(activeThreadId);
    }
  }, [activeThreadId, loadMessages]);

  // Polling for live messages and conversation updates every 4 seconds
  useEffect(() => {
    const timer = setInterval(() => {
      if (activeThreadId) {
        loadMessages(activeThreadId);
      }
      chatAPI
        .getConversations()
        .then((res) => {
          setConversations(res.data.data || []);
        })
        .catch(() => {});
    }, 4000);

    return () => clearInterval(timer);
  }, [activeThreadId, loadMessages]);

  // Auto scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  // User search debounce
  useEffect(() => {
    const q = trimmedQuery;
    if (!q) return;
    const timeout = setTimeout(() => {
      chatAPI
        .searchUsers(q)
        .then((res) => setSearchState({ q, results: res.data.data || [] }))
        .catch((err) => {
          console.error("Search failed:", err);
          setSearchState({ q, results: [] });
        });
    }, 300);
    return () => clearTimeout(timeout);
  }, [trimmedQuery]);

  // Start or open chat with a selected user
  const handleSelectUserToChat = async (targetUser: UserProfile) => {
    try {
      const res = await chatAPI.startConversation({ recipientId: targetUser.id });
      const { threadId, partner } = res.data.data;
      setActiveThreadId(threadId);
      setActivePartner(partner || targetUser);
      setSearchQuery("");
      setShowRightMenuMobile(false);
      await loadConversations();
      await loadMessages(threadId);
    } catch (err) {
      toast.error(apiErrorMessage(err, "Failed to start conversation."));
    }
  };

  // Send message
  const handleSendMessage = async () => {
    const body = text.trim();
    if (!body || !activeThreadId) return;

    setSending(true);
    try {
      const res = await chatAPI.sendConversationMessage(activeThreadId, body);
      setMessages((prev) => [...prev, res.data.data]);
      setText("");

      // Update conversations preview
      setConversations((prev) =>
        prev.map((c) =>
          c.id === activeThreadId
            ? {
                ...c,
                lastMessageAt: new Date().toISOString(),
                lastMessage: {
                  body,
                  createdAt: new Date().toISOString(),
                  senderId: currentUser?.id || "",
                },
              }
            : c
        )
      );
    } catch (err) {
      toast.error(apiErrorMessage(err, "Failed to send message."));
    } finally {
      setSending(false);
    }
  };

  const getRoleBadge = (role?: string) => {
    switch (role) {
      case "ADMIN":
        return (
          <span className="badge badge-primary" style={{ fontSize: 10, padding: "2px 6px" }}>
            <Shield size={10} style={{ marginRight: 2 }} /> Admin
          </span>
        );
      case "TEACHER":
        return (
          <span className="badge badge-success" style={{ fontSize: 10, padding: "2px 6px" }}>
            <GraduationCap size={10} style={{ marginRight: 2 }} /> Teacher
          </span>
        );
      default:
        return (
          <span className="badge badge-gray" style={{ fontSize: 10, padding: "2px 6px" }}>
            <User size={10} style={{ marginRight: 2 }} /> Learner
          </span>
        );
    }
  };

  const formatTime = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      const now = new Date();
      const isToday = d.toDateString() === now.toDateString();
      if (isToday) {
        return d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
      }
      return d.toLocaleDateString("en-IN", { month: "short", day: "numeric" });
    } catch {
      return "";
    }
  };

  return (
    <div
      className="card"
      style={{
        display: "flex",
        flexDirection: "row",
        height: "calc(100vh - 170px)",
        minHeight: 560,
        padding: 0,
        overflow: "hidden",
        position: "relative",
      }}
    >
      {/* ==================== LEFT / MAIN PANEL: ACTIVE CHAT ==================== */}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          minWidth: 0,
          background: "var(--bg-body)",
        }}
      >
        {/* Chat Header */}
        <div
          style={{
            padding: "14px 20px",
            borderBottom: "1px solid var(--border-color)",
            background: "white",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          {activePartner ? (
            <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: "50%",
                  background:
                    activePartner.role === "ADMIN"
                      ? "var(--primary-100)"
                      : activePartner.role === "TEACHER"
                      ? "#dcfce7"
                      : "var(--gray-100)",
                  color:
                    activePartner.role === "ADMIN"
                      ? "var(--primary)"
                      : activePartner.role === "TEACHER"
                      ? "#15803d"
                      : "var(--gray-700)",
                  fontWeight: 700,
                  fontSize: 16,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                {activePartner.firstName?.charAt(0) || "U"}
              </div>

              <div style={{ minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span
                    style={{
                      fontWeight: 700,
                      fontSize: 15,
                      color: "var(--gray-900)",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {activePartner.firstName} {activePartner.lastName}
                  </span>
                  {getRoleBadge(activePartner.role)}
                </div>

                <div
                  style={{
                    fontSize: 12,
                    color: "var(--gray-500)",
                    display: "flex",
                    gap: 8,
                    alignItems: "center",
                  }}
                >
                  <span>{displayLogin(activePartner)}</span>
                  {activePartner.username && (
                    <span style={{ fontFamily: "monospace" }}>@{activePartner.username}</span>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <MessageSquare size={20} color="var(--primary)" />
              <span style={{ fontWeight: 600, fontSize: 15 }}>Direct Messages</span>
            </div>
          )}

          {/* Mobile button to toggle conversation list */}
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => setShowRightMenuMobile(!showRightMenuMobile)}
            style={{ display: "flex", alignItems: "center", gap: 6 }}
          >
            <Menu size={16} />
            <span style={{ fontSize: 13 }}>Chat List</span>
          </button>
        </div>

        {hint && (
          <div
            className="alert alert-info"
            style={{ margin: 12, marginBottom: 0, fontSize: 12, padding: "8px 12px" }}
          >
            {hint}
          </div>
        )}

        {/* Message Stream */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "20px",
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          {loadingMessages ? (
            <div style={{ textAlign: "center", padding: "60px 20px" }}>
              <div className="loading-spinner" style={{ margin: "0 auto 12px" }} />
              <p style={{ color: "var(--gray-400)", fontSize: 13 }}>Loading conversation…</p>
            </div>
          ) : !activeThreadId ? (
            <div
              style={{
                textAlign: "center",
                padding: "80px 20px",
                color: "var(--gray-400)",
                maxWidth: 420,
                margin: "0 auto",
              }}
            >
              <div
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: "50%",
                  background: "var(--primary-50)",
                  color: "var(--primary)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  margin: "0 auto 16px",
                  fontSize: 28,
                }}
              >
                💬
              </div>
              <h3 style={{ fontSize: 17, fontWeight: 700, color: "var(--gray-800)", marginBottom: 8 }}>
                Start a Conversation
              </h3>
              <p style={{ fontSize: 13, lineHeight: 1.6 }}>
                Search for any student, teacher, or admin using their <strong>email</strong> or{" "}
                <strong>username</strong> from the menu on the right.
              </p>
            </div>
          ) : messages.length === 0 ? (
            <div
              style={{
                textAlign: "center",
                padding: "80px 20px",
                color: "var(--gray-400)",
              }}
            >
              <Sparkles size={32} style={{ margin: "0 auto 12px", color: "var(--primary)" }} />
              <div style={{ fontSize: 15, fontWeight: 600, color: "var(--gray-700)", marginBottom: 4 }}>
                This is the start of your message history with {activePartner?.firstName}
              </div>
              <div style={{ fontSize: 13 }}>Say hello to break the ice! 👋</div>
            </div>
          ) : (
            messages.map((m) => {
              const mine = m.senderId === currentUser?.id;
              return (
                <div
                  key={m.id}
                  style={{
                    display: "flex",
                    justifyContent: mine ? "flex-end" : "flex-start",
                  }}
                >
                  <div
                    style={{
                      maxWidth: "75%",
                      minWidth: "120px",
                      background: mine ? "var(--primary)" : "white",
                      color: mine ? "white" : "var(--gray-900)",
                      padding: "10px 14px",
                      borderRadius: mine ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
                      boxShadow: mine ? "0 2px 8px rgba(29, 78, 216, 0.2)" : "var(--shadow-sm)",
                      border: mine ? "none" : "1px solid var(--border-color)",
                      fontSize: 14,
                      lineHeight: 1.5,
                      wordBreak: "break-word",
                    }}
                  >
                    {!mine && m.sender && (
                      <div
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          color: "var(--primary)",
                          marginBottom: 4,
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                        }}
                      >
                        <span>
                          {m.sender.firstName} {m.sender.lastName}
                        </span>
                        <span style={{ opacity: 0.75, fontSize: 10 }}>· {m.sender.role}</span>
                      </div>
                    )}
                    <div style={{ whiteSpace: "pre-wrap" }}>{m.body}</div>
                    <div
                      style={{
                        fontSize: 10,
                        opacity: mine ? 0.8 : 0.5,
                        marginTop: 4,
                        textAlign: "right",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "flex-end",
                        gap: 4,
                      }}
                    >
                      <span>
                        {new Date(m.createdAt).toLocaleTimeString("en-IN", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                      {mine && <CheckCheck size={12} />}
                    </div>
                  </div>
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Message Input Box */}
        <div
          style={{
            padding: "14px 20px",
            background: "white",
            borderTop: "1px solid var(--border-color)",
            display: "flex",
            gap: 10,
            alignItems: "center",
          }}
        >
          <input
            className="input"
            placeholder={
              activePartner
                ? `Message ${activePartner.firstName}…`
                : "Select a user to chat…"
            }
            value={text}
            disabled={!activeThreadId || sending}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSendMessage();
              }
            }}
            style={{ flex: 1, height: 44 }}
          />
          <button
            className="btn btn-primary"
            onClick={handleSendMessage}
            disabled={!activeThreadId || !text.trim() || sending}
            style={{ height: 44, padding: "0 20px" }}
          >
            <Send size={16} /> Send
          </button>
        </div>
      </div>

      {/* ==================== RIGHT PANEL: MENU & CHAT HISTORY ==================== */}
      <div
        style={{
          width: 350,
          borderLeft: "1px solid var(--border-color)",
          background: "white",
          display: "flex",
          flexDirection: "column",
          height: "100%",
          zIndex: 10,
        }}
      >
        {/* Right Header / Search Bar */}
        <div
          style={{
            padding: "16px",
            borderBottom: "1px solid var(--border-color)",
            background: "var(--gray-50)",
          }}
        >
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 10, color: "var(--gray-800)" }}>
            Search & Direct Chat
          </div>

          <div style={{ position: "relative" }}>
            <Search
              size={15}
              style={{
                position: "absolute",
                left: 12,
                top: "50%",
                transform: "translateY(-50%)",
                color: "var(--gray-400)",
              }}
            />
            <input
              type="text"
              className="input"
              placeholder="Search email or username…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                paddingLeft: 34,
                paddingRight: searchQuery ? 30 : 12,
                height: 38,
                fontSize: 13,
                width: "100%",
              }}
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                style={{
                  position: "absolute",
                  right: 8,
                  top: "50%",
                  transform: "translateY(-50%)",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: "var(--gray-400)",
                }}
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>

        {/* Search Results Dropdown/Area */}
        {searchQuery.trim().length > 0 && (
          <div
            style={{
              maxHeight: 230,
              overflowY: "auto",
              borderBottom: "2px solid var(--primary-100)",
              background: "white",
              padding: "8px 0",
            }}
          >
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                textTransform: "uppercase",
                color: "var(--gray-400)",
                padding: "4px 16px 8px",
              }}
            >
              Search Results
            </div>

            {searching ? (
              <div style={{ padding: "12px 16px", fontSize: 13, color: "var(--gray-400)" }}>
                Searching users…
              </div>
            ) : searchResults.length === 0 ? (
              <div style={{ padding: "12px 16px", fontSize: 13, color: "var(--gray-400)" }}>
                No users found for &quot;{searchQuery}&quot;
              </div>
            ) : (
              searchResults.map((su) => (
                <div
                  key={su.id}
                  onClick={() => handleSelectUserToChat(su)}
                  style={{
                    padding: "10px 16px",
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    cursor: "pointer",
                    transition: "background 0.15s",
                    borderBottom: "1px solid var(--gray-50)",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "var(--gray-50)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: "50%",
                      background: "var(--primary-100)",
                      color: "var(--primary)",
                      fontWeight: 700,
                      fontSize: 14,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    {su.firstName?.charAt(0) || "U"}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span
                        style={{
                          fontWeight: 600,
                          fontSize: 13,
                          color: "var(--gray-900)",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {su.firstName} {su.lastName}
                      </span>
                      {getRoleBadge(su.role)}
                    </div>
                    <div
                      style={{
                        fontSize: 12,
                        color: "var(--gray-500)",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {displayLogin(su)}{su.username && displayLogin(su) !== su.username ? ` (@${su.username})` : ""}
                    </div>
                  </div>
                  <ChevronRight size={16} color="var(--gray-400)" />
                </div>
              ))
            )}
          </div>
        )}

        {/* Conversations History List */}
        <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column" }}>
          <div
            style={{
              padding: "12px 16px 6px",
              fontSize: 11,
              fontWeight: 700,
              textTransform: "uppercase",
              color: "var(--gray-400)",
              letterSpacing: "0.5px",
            }}
          >
            Chat History ({conversations.length})
          </div>

          {loadingConversations ? (
            <div style={{ padding: 24, textAlign: "center", color: "var(--gray-400)", fontSize: 13 }}>
              Loading conversations…
            </div>
          ) : conversations.length === 0 ? (
            <div style={{ padding: "32px 16px", textAlign: "center", color: "var(--gray-400)" }}>
              <div style={{ fontSize: 24, marginBottom: 8 }}>💬</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--gray-700)" }}>
                No chat history yet
              </div>
              <div style={{ fontSize: 12, marginTop: 4 }}>
                Search for an email or username above to start your first chat!
              </div>
            </div>
          ) : (
            conversations.map((c) => {
              const isActive = c.id === activeThreadId;
              const p = c.partner;
              return (
                <div
                  key={c.id}
                  onClick={() => {
                    setActiveThreadId(c.id);
                    setActivePartner(p);
                    setShowRightMenuMobile(false);
                  }}
                  style={{
                    padding: "12px 16px",
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    cursor: "pointer",
                    background: isActive ? "var(--primary-50)" : "transparent",
                    borderLeft: isActive ? "3px solid var(--primary)" : "3px solid transparent",
                    borderBottom: "1px solid var(--gray-100)",
                    transition: "all 0.15s",
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) e.currentTarget.style.background = "var(--gray-50)";
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) e.currentTarget.style.background = "transparent";
                  }}
                >
                  {/* Profile Avatar */}
                  <div
                    style={{
                      width: 42,
                      height: 42,
                      borderRadius: "50%",
                      background:
                        p.role === "ADMIN"
                          ? "var(--primary-100)"
                          : p.role === "TEACHER"
                          ? "#dcfce7"
                          : "var(--gray-100)",
                      color:
                        p.role === "ADMIN"
                          ? "var(--primary)"
                          : p.role === "TEACHER"
                          ? "#15803d"
                          : "var(--gray-700)",
                      fontWeight: 700,
                      fontSize: 15,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    {p.firstName?.charAt(0) || "U"}
                  </div>

                  {/* Profile Info & Preview */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        marginBottom: 2,
                      }}
                    >
                      <span
                        style={{
                          fontWeight: isActive ? 700 : 600,
                          fontSize: 13,
                          color: "var(--gray-900)",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {p.firstName} {p.lastName}
                      </span>
                      <span style={{ fontSize: 11, color: "var(--gray-400)", flexShrink: 0 }}>
                        {formatTime(c.lastMessageAt)}
                      </span>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                      {getRoleBadge(p.role)}
                      {p.username && (
                        <span style={{ fontSize: 11, color: "var(--gray-400)", fontFamily: "monospace" }}>
                          @{p.username}
                        </span>
                      )}
                    </div>

                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                      }}
                    >
                      <span
                        style={{
                          fontSize: 12,
                          color: c.unreadCount > 0 ? "var(--gray-900)" : "var(--gray-500)",
                          fontWeight: c.unreadCount > 0 ? 600 : 400,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          maxWidth: 190,
                        }}
                      >
                        {c.lastMessage?.body || "Started conversation"}
                      </span>

                      {c.unreadCount > 0 && (
                        <span
                          className="badge badge-primary"
                          style={{
                            fontSize: 10,
                            padding: "2px 6px",
                            borderRadius: 10,
                            fontWeight: 700,
                          }}
                        >
                          {c.unreadCount}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
