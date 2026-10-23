"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  Play, Pause, RotateCcw, RotateCw, SkipForward,
  Volume2, Volume1, VolumeX, Maximize, Minimize,
  PictureInPicture2, Check, AlertCircle
} from "lucide-react";

interface CustomVideoPlayerProps {
  src: string;
  title?: string;
  thumbnail?: string;
  autoPlay?: boolean;
  onTimeUpdate?: (currentTime: number, duration: number) => void;
  onEnded?: () => void;
  onNext?: () => void;
  hasNext?: boolean;
  onDurationDetected?: (duration: number) => void;
  disablePictureInPicture?: boolean;
  // Called when the source fails (e.g. an expired signed URL); the parent should supply a fresh src
  onSourceError?: () => void;
}

const SPEED_OPTIONS = [0.5, 0.75, 1, 1.25, 1.5, 2];

export default function CustomVideoPlayer({
  src,
  title,
  thumbnail,
  autoPlay = true,
  onTimeUpdate,
  onEnded,
  onNext,
  hasNext,
  onDurationDetected,
  disablePictureInPicture = false,
  onSourceError,
}: CustomVideoPlayerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const progressTrackRef = useRef<HTMLDivElement | null>(null);
  const hideControlsTimerRef = useRef<NodeJS.Timeout | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [bufferedEnd, setBufferedEnd] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const [hoverPosition, setHoverPosition] = useState<number>(0);
  const [centerAnimation, setCenterAnimation] = useState<"play" | "pause" | null>(null);
  const [isBuffering, setIsBuffering] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const sourceRetried = useRef(false);

  // New source: show the loader until the first frame can play
  const [loadedSrc, setLoadedSrc] = useState(src);
  if (loadedSrc !== src) {
    setLoadedSrc(src);
    setIsBuffering(true);
    setLoadError(false);
  }

  const triggerCenterAnim = useCallback((type: "play" | "pause") => {
    setCenterAnimation(type);
    setTimeout(() => setCenterAnimation(null), 600);
  }, []);

  // Play / Pause toggle
  const togglePlay = useCallback(() => {
    if (!videoRef.current) return;
    if (videoRef.current.paused) {
      videoRef.current.play().then(() => {
        setIsPlaying(true);
        triggerCenterAnim("play");
      }).catch(() => {});
    } else {
      videoRef.current.pause();
      setIsPlaying(false);
      triggerCenterAnim("pause");
    }
  }, [triggerCenterAnim]);

  // Autohide controls logic
  const resetHideTimer = useCallback(() => {
    setShowControls(true);
    if (hideControlsTimerRef.current) {
      clearTimeout(hideControlsTimerRef.current);
    }
    if (isPlaying) {
      hideControlsTimerRef.current = setTimeout(() => {
        if (!showSpeedMenu) {
          setShowControls(false);
        }
      }, 2500);
    }
  }, [isPlaying, showSpeedMenu]);

  // While playing, controls fade out after a pause in mouse movement; paused video always shows them
  useEffect(() => {
    if (!isPlaying) return;
    hideControlsTimerRef.current = setTimeout(() => {
      if (!showSpeedMenu) setShowControls(false);
    }, 2500);
    return () => {
      if (hideControlsTimerRef.current) clearTimeout(hideControlsTimerRef.current);
    };
  }, [isPlaying, showSpeedMenu]);
  const controlsVisible = showControls || !isPlaying;

  // Video event handlers
  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      const dur = Math.round(videoRef.current.duration);
      setDuration(dur);
      if (onDurationDetected && dur > 0) {
        onDurationDetected(dur);
      }
      if (autoPlay) {
        videoRef.current.play().then(() => setIsPlaying(true)).catch(() => {});
      }
    }
  };

  const handleTimeUpdate = () => {
    if (!videoRef.current) return;
    const curr = videoRef.current.currentTime;
    setCurrentTime(curr);

    // Buffer progress
    if (videoRef.current.buffered.length > 0) {
      setBufferedEnd(videoRef.current.buffered.end(videoRef.current.buffered.length - 1));
    }

    if (onTimeUpdate) {
      onTimeUpdate(curr, videoRef.current.duration || 0);
    }
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!progressTrackRef.current || !videoRef.current || duration <= 0) return;
    const rect = progressTrackRef.current.getBoundingClientRect();
    const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const newTime = pos * duration;
    videoRef.current.currentTime = newTime;
    setCurrentTime(newTime);
  };

  const handleMouseMoveProgress = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!progressTrackRef.current || duration <= 0) return;
    const rect = progressTrackRef.current.getBoundingClientRect();
    const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    setHoverPosition(pos * 100);
    setHoverTime(pos * duration);
  };

  const handleMouseLeaveProgress = () => {
    setHoverTime(null);
  };

  const skipSeconds = (seconds: number) => {
    if (!videoRef.current) return;
    videoRef.current.currentTime = Math.max(0, Math.min(duration, videoRef.current.currentTime + seconds));
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setVolume(val);
    if (videoRef.current) {
      videoRef.current.volume = val;
      videoRef.current.muted = val === 0;
      setIsMuted(val === 0);
    }
  };

  const toggleMute = () => {
    if (!videoRef.current) return;
    const newMuted = !isMuted;
    setIsMuted(newMuted);
    videoRef.current.muted = newMuted;
    if (!newMuted && volume === 0) {
      setVolume(0.5);
      videoRef.current.volume = 0.5;
    }
  };

  const changeSpeed = (speed: number) => {
    setPlaybackSpeed(speed);
    if (videoRef.current) {
      videoRef.current.playbackRate = speed;
    }
    setShowSpeedMenu(false);
  };

  const togglePictureInPicture = async () => {
    if (!videoRef.current) return;
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else if (document.pictureInPictureEnabled) {
        await videoRef.current.requestPictureInPicture();
      }
    } catch {}
  };

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  useEffect(() => {
    const onFsChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  // Keyboard controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept if typing in an input
      if (["INPUT", "TEXTAREA"].includes((e.target as HTMLElement)?.tagName)) return;

      if (e.code === "Space" || e.key === "k") {
        e.preventDefault();
        togglePlay();
      } else if (e.key === "f") {
        e.preventDefault();
        toggleFullscreen();
      } else if (e.key === "m") {
        e.preventDefault();
        toggleMute();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        skipSeconds(-5);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        skipSeconds(5);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setVolume((v) => {
          const nv = Math.min(1, v + 0.1);
          if (videoRef.current) videoRef.current.volume = nv;
          return nv;
        });
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setVolume((v) => {
          const nv = Math.max(0, v - 0.1);
          if (videoRef.current) videoRef.current.volume = nv;
          return nv;
        });
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [togglePlay]);

  const formatTime = (seconds: number) => {
    if (isNaN(seconds) || seconds < 0) return "00:00";
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) {
      return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
    }
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;
  const bufferPercent = duration > 0 ? (bufferedEnd / duration) * 100 : 0;

  return (
    <div
      ref={containerRef}
      className="custom-player-root"
      onMouseMove={resetHideTimer}
      onMouseLeave={() => isPlaying && setShowControls(false)}
      style={{
        position: "relative",
        width: "100%",
        aspectRatio: "16 / 9",
        backgroundColor: "#07090e",
        borderRadius: isFullscreen ? 0 : 18,
        overflow: "hidden",
        boxShadow: "0 14px 34px -4px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(255, 255, 255, 0.08)",
        userSelect: "none",
      }}
    >
      {/* Video Element */}
      <video
        ref={videoRef}
        src={src}
        poster={thumbnail}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "contain",
          cursor: "pointer",
        }}
        onClick={togglePlay}
        onLoadedMetadata={handleLoadedMetadata}
        onTimeUpdate={handleTimeUpdate}
        onEnded={onEnded}
        onLoadStart={() => setIsBuffering(true)}
        onWaiting={() => setIsBuffering(true)}
        onSeeking={() => setIsBuffering(true)}
        onCanPlay={() => setIsBuffering(false)}
        onPlaying={() => setIsBuffering(false)}
        onSeeked={() => {
          if ((videoRef.current?.readyState ?? 0) >= 3) setIsBuffering(false);
        }}
        onError={() => {
          // First failure: quietly ask for a fresh source (signed URLs expire); show the error only if that fails too
          if (onSourceError && !sourceRetried.current) {
            sourceRetried.current = true;
            onSourceError();
            return;
          }
          setIsBuffering(false);
          setLoadError(true);
        }}
        onLoadedData={() => { sourceRetried.current = false; }}
        onContextMenu={(e) => e.preventDefault()}
        playsInline
        disablePictureInPicture={disablePictureInPicture}
        controlsList="nodownload noplaybackrate"
      />

      {/* Loading / buffering spinner */}
      {isBuffering && !loadError && (
        <div
          aria-label="Loading video"
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 12,
            background: currentTime === 0 ? "rgba(7, 9, 14, 0.75)" : "transparent",
            color: "rgba(255,255,255,0.85)",
            fontSize: 13,
            fontWeight: 500,
            pointerEvents: "none",
            zIndex: 6,
          }}
        >
          <div className="custom-player-spinner" />
          {currentTime === 0 && <span>Loading video…</span>}
        </div>
      )}

      {loadError && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 10,
            background: "#07090e",
            color: "white",
            textAlign: "center",
            padding: 24,
            zIndex: 7,
          }}
        >
          <AlertCircle size={36} color="#f87171" />
          <div style={{ fontWeight: 600 }}>This video could not be loaded.</div>
          <div style={{ fontSize: 13, opacity: 0.7 }}>Check your internet connection and try again.</div>
          <button
            className="btn btn-secondary btn-sm"
            style={{ marginTop: 6 }}
            onClick={() => {
              setLoadError(false);
              setIsBuffering(true);
              if (onSourceError) onSourceError();
              else videoRef.current?.load();
            }}
          >
            Retry
          </button>
        </div>
      )}

      {/* Center Animated Play/Pause Feedback Icon */}
      {centerAnimation && (
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%) scale(1.1)",
            width: 76,
            height: 76,
            borderRadius: "50%",
            background: "rgba(0, 0, 0, 0.65)",
            backdropFilter: "blur(8px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#ffffff",
            pointerEvents: "none",
            animation: "centerPop 0.6s ease forwards",
            zIndex: 15,
          }}
        >
          {centerAnimation === "play" ? (
            <Play size={36} fill="#ffffff" style={{ marginLeft: 3 }} />
          ) : (
            <Pause size={36} fill="#ffffff" />
          )}
        </div>
      )}

      {/* Top Bar Overlay (Title) */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          padding: "16px 22px",
          background: "linear-gradient(to bottom, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0) 100%)",
          color: "#ffffff",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          opacity: controlsVisible ? 1 : 0,
          transition: "opacity 0.25s ease",
          pointerEvents: controlsVisible ? "auto" : "none",
          zIndex: 10,
        }}
      >
        <div style={{ fontSize: 15, fontWeight: 600, textShadow: "0 1px 3px rgba(0,0,0,0.8)", letterSpacing: "-0.01em" }}>
          {title}
        </div>
      </div>

      {/* Bottom Controls Overlay */}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          padding: "12px 18px 14px",
          background: "linear-gradient(to top, rgba(0,0,0,0.88) 0%, rgba(0,0,0,0.5) 60%, rgba(0,0,0,0) 100%)",
          opacity: controlsVisible ? 1 : 0,
          transition: "opacity 0.25s ease",
          pointerEvents: controlsVisible ? "auto" : "none",
          zIndex: 10,
        }}
      >
        {/* Timeline / Progress Bar */}
        <div
          ref={progressTrackRef}
          onClick={handleSeek}
          onMouseMove={handleMouseMoveProgress}
          onMouseEnter={(e) => (e.currentTarget.style.height = "9px")}
          onMouseLeave={(e) => {
            e.currentTarget.style.height = "6px";
            handleMouseLeaveProgress();
          }}
          style={{
            position: "relative",
            width: "100%",
            height: 6,
            background: "rgba(255, 255, 255, 0.25)",
            borderRadius: 4,
            cursor: "pointer",
            marginBottom: 10,
            transition: "height 0.15s ease",
          }}
        >
          {/* Buffer Bar */}
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              bottom: 0,
              width: `${bufferPercent}%`,
              background: "rgba(255, 255, 255, 0.4)",
              borderRadius: 4,
            }}
          />

          {/* Played Progress Bar */}
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              bottom: 0,
              width: `${progressPercent}%`,
              background: "linear-gradient(90deg, #8b5cf6, #1d4ed8)",
              borderRadius: 4,
            }}
          />

          {/* Scrubber Thumb */}
          <div
            style={{
              position: "absolute",
              top: "50%",
              left: `${progressPercent}%`,
              transform: "translate(-50%, -50%)",
              width: 14,
              height: 14,
              borderRadius: "50%",
              backgroundColor: "#ffffff",
              boxShadow: "0 0 8px rgba(139, 92, 246, 0.8)",
              pointerEvents: "none",
            }}
          />

          {/* Hover Time Tooltip */}
          {hoverTime !== null && (
            <div
              style={{
                position: "absolute",
                bottom: 16,
                left: `${hoverPosition}%`,
                transform: "translateX(-50%)",
                background: "rgba(17, 24, 39, 0.9)",
                color: "#ffffff",
                padding: "3px 7px",
                borderRadius: 4,
                fontSize: 11,
                fontWeight: 600,
                pointerEvents: "none",
                whiteSpace: "nowrap",
                boxShadow: "0 2px 6px rgba(0,0,0,0.3)",
              }}
            >
              {formatTime(hoverTime)}
            </div>
          )}
        </div>

        {/* Buttons Row */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", color: "#ffffff" }}>
          {/* Left Controls */}
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {/* Play/Pause Button */}
            <button
              onClick={togglePlay}
              className="player-ctrl-btn"
              title={isPlaying ? "Pause (Space)" : "Play (Space)"}
            >
              {isPlaying ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" style={{ marginLeft: 2 }} />}
            </button>

            {/* Rewind 10s */}
            <button
              onClick={() => skipSeconds(-10)}
              className="player-ctrl-btn"
              title="Rewind 10 seconds"
            >
              <RotateCcw size={18} />
            </button>

            {/* Forward 10s */}
            <button
              onClick={() => skipSeconds(10)}
              className="player-ctrl-btn"
              title="Forward 10 seconds"
            >
              <RotateCw size={18} />
            </button>

            {/* Next Lecture */}
            {hasNext && onNext && (
              <button
                onClick={onNext}
                className="player-ctrl-btn"
                title="Next lecture"
              >
                <SkipForward size={18} />
              </button>
            )}

            {/* Volume Control */}
            <div
              style={{ display: "flex", alignItems: "center", gap: 6 }}
              onMouseEnter={(e) => {
                const slider = e.currentTarget.querySelector(".volume-slider") as HTMLElement;
                if (slider) slider.style.width = "70px";
              }}
              onMouseLeave={(e) => {
                const slider = e.currentTarget.querySelector(".volume-slider") as HTMLElement;
                if (slider) slider.style.width = "0px";
              }}
            >
              <button onClick={toggleMute} className="player-ctrl-btn" title="Mute (m)">
                {isMuted || volume === 0 ? (
                  <VolumeX size={19} />
                ) : volume < 0.5 ? (
                  <Volume1 size={19} />
                ) : (
                  <Volume2 size={19} />
                )}
              </button>

              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={isMuted ? 0 : volume}
                onChange={handleVolumeChange}
                className="volume-slider"
                style={{
                  width: 0,
                  transition: "width 0.2s ease",
                  accentColor: "#8b5cf6",
                  cursor: "pointer",
                  height: 4,
                  overflow: "hidden",
                }}
              />
            </div>

            {/* Time Stamp Display */}
            <div style={{ fontSize: 13, fontWeight: 500, color: "#d1d5db", marginLeft: 4 }}>
              <span style={{ color: "#ffffff", fontWeight: 600 }}>{formatTime(currentTime)}</span>
              <span style={{ opacity: 0.6, margin: "0 4px" }}>/</span>
              <span>{formatTime(duration)}</span>
            </div>
          </div>

          {/* Right Controls */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, position: "relative" }}>
            {/* Playback Speed Button & Menu */}
            <div style={{ position: "relative" }}>
              <button
                onClick={() => setShowSpeedMenu(!showSpeedMenu)}
                className="player-ctrl-btn"
                style={{
                  fontSize: 13,
                  fontWeight: 700,
                  padding: "4px 8px",
                  borderRadius: 6,
                  background: "rgba(255, 255, 255, 0.12)",
                }}
                title="Playback Speed"
              >
                {playbackSpeed}x
              </button>

              {showSpeedMenu && (
                <div
                  style={{
                    position: "absolute",
                    bottom: 34,
                    right: 0,
                    background: "rgba(17, 24, 39, 0.95)",
                    backdropFilter: "blur(10px)",
                    border: "1px solid rgba(255, 255, 255, 0.15)",
                    borderRadius: 10,
                    padding: "6px 0",
                    minWidth: 100,
                    zIndex: 20,
                    boxShadow: "0 10px 25px rgba(0,0,0,0.5)",
                  }}
                >
                  <div style={{ padding: "6px 14px", fontSize: 11, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase" }}>
                    Speed
                  </div>
                  {SPEED_OPTIONS.map((speed) => (
                    <button
                      key={speed}
                      onClick={() => changeSpeed(speed)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        width: "100%",
                        padding: "7px 14px",
                        background: speed === playbackSpeed ? "rgba(139, 92, 246, 0.25)" : "transparent",
                        color: speed === playbackSpeed ? "#c4b5fd" : "#ffffff",
                        border: "none",
                        fontSize: 13,
                        fontWeight: speed === playbackSpeed ? 700 : 500,
                        cursor: "pointer",
                        textAlign: "left",
                      }}
                    >
                      <span>{speed === 1 ? "Normal" : `${speed}x`}</span>
                      {speed === playbackSpeed && <Check size={14} color="#8b5cf6" />}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {!disablePictureInPicture && (
              <button
                onClick={togglePictureInPicture}
                className="player-ctrl-btn"
                title="Picture in Picture"
              >
                <PictureInPicture2 size={19} />
              </button>
            )}

            {/* Fullscreen */}
            <button
              onClick={toggleFullscreen}
              className="player-ctrl-btn"
              title={isFullscreen ? "Exit Fullscreen (f)" : "Fullscreen (f)"}
            >
              {isFullscreen ? <Minimize size={19} /> : <Maximize size={19} />}
            </button>
          </div>
        </div>
      </div>

      <style jsx>{`
        .player-ctrl-btn {
          background: transparent;
          border: none;
          color: #ffffff;
          cursor: pointer;
          padding: 6px;
          border-radius: 6px;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: background 0.15s ease, transform 0.1s ease;
        }
        .player-ctrl-btn:hover {
          background: rgba(255, 255, 255, 0.18);
          transform: scale(1.06);
        }
        .player-ctrl-btn:active {
          transform: scale(0.96);
        }
        @keyframes centerPop {
          0% {
            opacity: 0;
            transform: translate(-50%, -50%) scale(0.7);
          }
          50% {
            opacity: 1;
            transform: translate(-50%, -50%) scale(1.15);
          }
          100% {
            opacity: 0;
            transform: translate(-50%, -50%) scale(1.3);
          }
        }
      `}</style>
    </div>
  );
}
