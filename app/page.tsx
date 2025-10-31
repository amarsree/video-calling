"use client";

import { useState, useEffect, useRef } from "react";
import { io, Socket } from "socket.io-client";
import { v4 as uuidv4 } from "uuid";

export default function Home() {
  const [roomId, setRoomId] = useState<string>("");
  const [joined, setJoined] = useState(false);
  const [isCreatingRoom, setIsCreatingRoom] = useState(false);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [peerConnection, setPeerConnection] =
    useState<RTCPeerConnection | null>(null);

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const socketRef = useRef<Socket | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    return () => {
      // Cleanup only on unmount, not when localStream changes
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => track.stop());
      }
      if (peerConnectionRef.current) {
        peerConnectionRef.current.close();
      }
    };
  }, []); // Empty dependency array - only run cleanup on unmount

  const createRoom = () => {
    //const newRoomId = uuidv4();
    const newRoomId = "1234";
    setRoomId(newRoomId);
    setIsCreatingRoom(true);
    joinRoom(newRoomId);
  };

  const joinRoom = async (room: string) => {
    // In production, use the environment variable or detect from window.location
    const socketUrl =
      process.env.NEXT_PUBLIC_SOCKET_URL ||
      (typeof window !== "undefined"
        ? window.location.origin
        : "http://localhost:3000");
    console.log("Connecting to socket server:", socketUrl);

    const newSocket = io(socketUrl, {
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });
    socketRef.current = newSocket;
    setSocket(newSocket);

    newSocket.on("connect", async () => {
      console.log("Socket connected, socket ID:", newSocket.id);

      // Initialize peer connection first
      initializePeerConnection(newSocket, room);

      // Start local video and add tracks to peer connection
      await startLocalVideo();

      // Ensure tracks are added to peer connection immediately after stream is ready
      if (peerConnectionRef.current && localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => {
          if (
            peerConnectionRef.current &&
            !peerConnectionRef.current
              .getSenders()
              .find((s) => s.track === track)
          ) {
            peerConnectionRef.current.addTrack(track, localStreamRef.current!);
            console.log("Track added to peer connection:", track.kind);
          }
        });
      }

      // Then join the room
      console.log("Emitting join-room for room:", room);
      newSocket.emit("join-room", room);
    });

    newSocket.on("connect_error", (error) => {
      console.error("Socket connection error:", error);
    });

    newSocket.on("disconnect", (reason) => {
      console.log("Socket disconnected:", reason);
    });

    // When someone joins (existing user waits for offer - don't create offer)
    newSocket.on("user-joined", async (data) => {
      console.log("New user joined, waiting for their offer...", data);
      // Don't create offer here - the new user will create it
      // Just ensure tracks are ready in case we need to answer
      if (peerConnectionRef.current && localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => {
          if (
            peerConnectionRef.current &&
            !peerConnectionRef.current
              .getSenders()
              .find((s) => s.track === track)
          ) {
            peerConnectionRef.current.addTrack(track, localStreamRef.current!);
            console.log("Track added in user-joined handler:", track.kind);
          }
        });
      } else {
        console.warn(
          "Peer connection or local stream not ready when user joined"
        );
      }
    });

    // When joining an existing room (new user creates offer)
    newSocket.on("peer-ready", async (data) => {
      console.log("Peer ready, creating offer", data);
      // Wait a bit to ensure peer connection is fully initialized
      await new Promise((resolve) => setTimeout(resolve, 100));

      if (peerConnectionRef.current && localStreamRef.current) {
        // Ensure tracks are added before creating offer
        localStreamRef.current.getTracks().forEach((track) => {
          if (
            peerConnectionRef.current &&
            !peerConnectionRef.current
              .getSenders()
              .find((s) => s.track === track)
          ) {
            peerConnectionRef.current.addTrack(track, localStreamRef.current!);
            console.log("Track added before offer:", track.kind);
          }
        });
        await createOffer(peerConnectionRef.current, room);
      } else {
        console.error(
          "Cannot create offer: peer connection or local stream not ready",
          {
            hasPeerConnection: !!peerConnectionRef.current,
            hasLocalStream: !!localStreamRef.current,
          }
        );
      }
    });

    newSocket.on(
      "offer",
      async (data: { offer: RTCSessionDescriptionInit; from: string }) => {
        console.log("Received offer from", data.from);
        if (peerConnectionRef.current) {
          try {
            // Ensure tracks are added before setting remote description
            if (localStreamRef.current) {
              localStreamRef.current.getTracks().forEach((track) => {
                if (
                  peerConnectionRef.current &&
                  !peerConnectionRef.current
                    .getSenders()
                    .find((s) => s.track === track)
                ) {
                  peerConnectionRef.current.addTrack(
                    track,
                    localStreamRef.current!
                  );
                  console.log("Track added before answer:", track.kind);
                }
              });
            }

            await peerConnectionRef.current.setRemoteDescription(
              new RTCSessionDescription(data.offer)
            );
            console.log("Remote description set");

            const answer = await peerConnectionRef.current.createAnswer();
            await peerConnectionRef.current.setLocalDescription(answer);
            newSocket.emit("answer", { answer, roomId: room });
            console.log("Answer sent to", data.from);
          } catch (error) {
            console.error("Error handling offer:", error);
          }
        } else {
          console.error("Cannot handle offer: peer connection not ready");
        }
      }
    );

    newSocket.on(
      "answer",
      async (data: { answer: RTCSessionDescriptionInit; from: string }) => {
        console.log("Received answer from", data.from);
        if (peerConnectionRef.current) {
          try {
            const currentRemoteDesc =
              peerConnectionRef.current.remoteDescription;
            if (!currentRemoteDesc || currentRemoteDesc.type !== "offer") {
              console.warn(
                "Received answer but remote description is not set or not an offer"
              );
            }
            await peerConnectionRef.current.setRemoteDescription(
              new RTCSessionDescription(data.answer)
            );
            console.log("Answer set as remote description");
          } catch (error) {
            console.error("Error handling answer:", error);
          }
        } else {
          console.error("Cannot handle answer: peer connection not ready");
        }
      }
    );

    newSocket.on(
      "ice-candidate",
      async (data: { candidate: RTCIceCandidateInit; from: string }) => {
        if (peerConnectionRef.current && data.candidate) {
          try {
            await peerConnectionRef.current.addIceCandidate(
              new RTCIceCandidate(data.candidate)
            );
            console.log("ICE candidate added");
          } catch (error) {
            console.error("Error adding ICE candidate:", error);
          }
        }
      }
    );

    setJoined(true);
  };

  const initializePeerConnection = (socket: Socket, room: string) => {
    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
      ],
    });

    peerConnectionRef.current = pc;
    setPeerConnection(pc);

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit("ice-candidate", {
          candidate: event.candidate,
          roomId: room,
        });
        console.log("ICE candidate sent");
      }
    };

    pc.ontrack = (event) => {
      console.log("Received remote track:", event.track.kind);
      if (event.streams && event.streams[0]) {
        setRemoteStream(event.streams[0]);
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = event.streams[0];
          console.log("Remote video stream set");
        }
      }
    };

    pc.onconnectionstatechange = () => {
      console.log("Connection state:", pc.connectionState);
    };

    pc.oniceconnectionstatechange = () => {
      console.log("ICE connection state:", pc.iceConnectionState);
    };
  };

  const startLocalVideo = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });
      localStreamRef.current = stream;
      setLocalStream(stream);

      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }

      console.log("Local video stream started");
    } catch (error) {
      console.error("Error accessing media devices:", error);
      alert(
        "Could not access your camera/microphone. Please allow permissions."
      );
    }
  };

  const createOffer = async (pc: RTCPeerConnection, room: string) => {
    try {
      console.log("Creating offer...");
      const offer = await pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true,
      });
      await pc.setLocalDescription(offer);
      socketRef.current?.emit("offer", { offer, roomId: room });
      console.log("Offer created and sent");
    } catch (error) {
      console.error("Error creating offer:", error);
    }
  };

  const handleJoinRoom = () => {
    if (roomId.trim()) {
      joinRoom(roomId.trim());
    }
  };

  const leaveCall = () => {
    if (socketRef.current) {
      socketRef.current.disconnect();
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
    }
    setJoined(false);
    setRoomId("");
    setIsCreatingRoom(false);
    setLocalStream(null);
    setRemoteStream(null);
    setSocket(null);
    setPeerConnection(null);
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null;
    }
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800">
      <div className="container mx-auto px-4 py-8">
        <h1 className="text-4xl font-bold text-center mb-8 text-gray-800 dark:text-white">
          Video Calling App
        </h1>

        {!joined ? (
          <div className="max-w-md mx-auto bg-white dark:bg-gray-800 rounded-lg shadow-lg p-8">
            <div className="space-y-6">
              <button
                onClick={createRoom}
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3 px-6 rounded-lg transition-colors"
              >
                Create New Room
              </button>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-300 dark:border-gray-600"></div>
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-2 bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400">
                    OR
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Join with Room ID
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={roomId}
                    onChange={(e) => setRoomId(e.target.value)}
                    placeholder="Enter room ID"
                    className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                    onKeyPress={(e) => e.key === "Enter" && handleJoinRoom()}
                  />
                  <button
                    onClick={handleJoinRoom}
                    disabled={!roomId.trim()}
                    className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white font-semibold py-2 px-6 rounded-lg transition-colors"
                  >
                    Join
                  </button>
                </div>
              </div>

              {isCreatingRoom && (
                <div className="mt-4 p-4 bg-indigo-50 dark:bg-indigo-900/20 rounded-lg">
                  <p className="text-sm text-indigo-700 dark:text-indigo-300 font-medium mb-2">
                    Room Created! Share this ID:
                  </p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 px-3 py-2 bg-white dark:bg-gray-700 rounded border border-indigo-200 dark:border-indigo-700 text-indigo-800 dark:text-indigo-200 font-mono text-sm">
                      {roomId}
                    </code>
                    <button
                      onClick={() => navigator.clipboard.writeText(roomId)}
                      className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded text-sm font-medium transition-colors"
                    >
                      Copy
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="max-w-6xl mx-auto">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 mb-4">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Room ID:
                  </p>
                  <code className="text-indigo-600 dark:text-indigo-400 font-mono text-lg font-semibold">
                    {roomId}
                  </code>
                </div>
                <button
                  onClick={leaveCall}
                  className="bg-red-600 hover:bg-red-700 text-white font-semibold py-2 px-6 rounded-lg transition-colors"
                >
                  Leave Call
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-gray-900 rounded-lg overflow-hidden shadow-lg">
                <video
                  ref={localVideoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                />
                <div className="bg-gray-800 px-4 py-2 text-white text-sm">
                  You (Local)
                </div>
              </div>

              <div className="bg-gray-900 rounded-lg overflow-hidden shadow-lg">
                <video
                  ref={remoteVideoRef}
                  autoPlay
                  playsInline
                  className="w-full h-full object-cover"
                />
                <div className="bg-gray-800 px-4 py-2 text-white text-sm">
                  Remote
                </div>
              </div>
            </div>

            {!remoteStream && (
              <div className="mt-4 text-center">
                <p className="text-gray-600 dark:text-gray-400">
                  Waiting for someone to join the room...
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
