'use client';

import { useChat } from '@ai-sdk/react';
import { useRef, useEffect, useState, useCallback } from 'react';
import { Video, VideoOff, Mic, Moon, Sun, Settings, X, Check, Brain, MessageCircle, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DefaultChatTransport } from 'ai';
import ReactMarkdown from 'react-markdown';

export function InterviewRoomClient() {
    const videoRef = useRef<HTMLVideoElement>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const audioChunksRef = useRef<Blob[]>([]);
    const currentAudioRef = useRef<HTMLAudioElement | null>(null);
    const [isVideoEnabled, setIsVideoEnabled] = useState(true);
    const [isRecording, setIsRecording] = useState(false);
    const [whiteboardContent, setWhiteboardContent] = useState<string>('');
    const [isProcessingSpeech, setIsProcessingSpeech] = useState(false);
    const [isTranscribing, setIsTranscribing] = useState(false);
    const [currentSpeechText, setCurrentSpeechText] = useState<string>('');
    const [candidateSpeechText, setCandidateSpeechText] = useState<string>('');
    const speechTextDisplayRef = useRef<string>('');
    const speechTextTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const processedMessageIdsRef = useRef<Set<string>>(new Set());
    const messageQueueRef = useRef<string[]>([]);
    const previousStatusRef = useRef<string>('');
    const [isDarkMode, setIsDarkMode] = useState(false);
    const [showSettings, setShowSettings] = useState(false);
    const [availableDevices, setAvailableDevices] = useState<{
        videoDevices: MediaDeviceInfo[];
        audioDevices: MediaDeviceInfo[];
    }>({ videoDevices: [], audioDevices: [] });
    const [selectedVideoDevice, setSelectedVideoDevice] = useState<string>('');
    const [selectedAudioDevice, setSelectedAudioDevice] = useState<string>('');

    // 初始化主题
    useEffect(() => {
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        const storedTheme = localStorage.getItem('theme');
        const theme = storedTheme || (prefersDark ? 'dark' : 'light');
        setIsDarkMode(theme === 'dark');
        
        if (theme === 'dark') {
            document.documentElement.classList.add('dark');
        } else {
            document.documentElement.classList.remove('dark');
        }

        // 监听系统主题变化
        const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
        const handleChange = (e: MediaQueryListEvent) => {
            if (!localStorage.getItem('theme')) {
                setIsDarkMode(e.matches);
                if (e.matches) {
                    document.documentElement.classList.add('dark');
                } else {
                    document.documentElement.classList.remove('dark');
                }
            }
        };
        mediaQuery.addEventListener('change', handleChange);
        return () => mediaQuery.removeEventListener('change', handleChange);
    }, []);

    // 切换主题
    const toggleTheme = useCallback(() => {
        const newTheme = isDarkMode ? 'light' : 'dark';
        setIsDarkMode(!isDarkMode);
        localStorage.setItem('theme', newTheme);
        if (newTheme === 'dark') {
            document.documentElement.classList.add('dark');
        } else {
            document.documentElement.classList.remove('dark');
        }
    }, [isDarkMode]);

    const { messages, sendMessage, status } = useChat({
        transport: new DefaultChatTransport({
            api: '/api/chat',
        })
    });

    // 初始化 previousStatusRef
    useEffect(() => {
        if (previousStatusRef.current === '') {
            previousStatusRef.current = status;
        }
    }, [status]);

    // 开始流式显示字幕
    const startStreamingSubtitle = useCallback((text: string) => {
        // 清除之前的定时器
        if (speechTextTimerRef.current) {
            clearInterval(speechTextTimerRef.current);
        }
        speechTextDisplayRef.current = '';
        setCurrentSpeechText('');
        
        // 逐字显示字幕（模拟流式输出）
        let currentIndex = 0;
        const displayInterval = setInterval(() => {
            if (currentIndex < text.length) {
                // 每次显示一个字符或一个词（如果是中文）
                const char = text[currentIndex];
                const isChinese = /[\u4e00-\u9fa5]/.test(char);
                const step = isChinese ? 1 : (char === ' ' ? 1 : Math.min(3, text.length - currentIndex));
                speechTextDisplayRef.current = text.substring(0, currentIndex + step);
                setCurrentSpeechText(speechTextDisplayRef.current);
                currentIndex += step;
            } else {
                clearInterval(displayInterval);
                speechTextTimerRef.current = null;
            }
        }, 50); // 每50ms显示一次，调整速度
        
        speechTextTimerRef.current = displayInterval;
    }, []);

    // 播放语音（流式）
    const playSpeech = useCallback(async (text: string, instructions?: string, subtitleText?: string) => {
        try {
            // 停止当前正在播放的音频
            if (currentAudioRef.current) {
                currentAudioRef.current.pause();
                currentAudioRef.current.currentTime = 0;
                // 清理之前的 URL
                if (currentAudioRef.current.src.startsWith('blob:')) {
                    URL.revokeObjectURL(currentAudioRef.current.src);
                }
                currentAudioRef.current = null;
            }

            // 清除之前的字幕显示
            if (speechTextTimerRef.current) {
                clearInterval(speechTextTimerRef.current);
                speechTextTimerRef.current = null;
            }
            setCurrentSpeechText('');
            speechTextDisplayRef.current = '';

            setIsProcessingSpeech(true);

            // 调用服务器端 API 生成语音（流式）
            const response = await fetch('/api/speech', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ text, instructions }),
            });

            if (!response.ok) {
                throw new Error('Failed to generate speech');
            }

            // 使用流式响应创建音频
            const reader = response.body?.getReader();
            if (!reader) {
                throw new Error('No response body');
            }

            const chunks: BlobPart[] = [];
            let done = false;

            while (!done) {
                const { value, done: readerDone } = await reader.read();
                done = readerDone;
                if (value) {
                    chunks.push(value);
                }
            }

            // 将流式数据合并为 Blob
            const audioBlob = new Blob(chunks, { type: 'audio/mpeg' });
            const audioUrl = URL.createObjectURL(audioBlob);
            const audio = new Audio(audioUrl);

            // 保存当前音频引用
            currentAudioRef.current = audio;

            // 等待播放完成
            await new Promise((resolve, reject) => {
                audio.onplay = () => {
                    // 音频开始播放时，开始流式显示字幕
                    if (subtitleText) {
                        startStreamingSubtitle(subtitleText);
                    }
                };
                
                audio.onended = () => {
                    URL.revokeObjectURL(audioUrl);
                    if (currentAudioRef.current === audio) {
                        currentAudioRef.current = null;
                    }
                    resolve(undefined);
                };
                audio.onerror = (error) => {
                    URL.revokeObjectURL(audioUrl);
                    if (currentAudioRef.current === audio) {
                        currentAudioRef.current = null;
                    }
                    reject(error);
                };
                audio.play().catch((error) => {
                    URL.revokeObjectURL(audioUrl);
                    if (currentAudioRef.current === audio) {
                        currentAudioRef.current = null;
                    }
                    reject(error);
                });
            });
        } catch (error) {
            console.error('Error generating or playing speech:', error);
            // 确保在错误时也清理引用
            if (currentAudioRef.current) {
                currentAudioRef.current = null;
            }
        } finally {
            setIsProcessingSpeech(false);
        }
    }, [startStreamingSubtitle]);

    // 解析消息并处理不同的标签
    const parseAndHandleMessage = useCallback(async (content: string, shouldPlaySpeech: boolean = true) => {
        // 提取 <speech> 标签内容（使用 [\s\S] 代替 s 标志以兼容 ES2017）
        const speechMatch = content.match(/<speech>([\s\S]*?)<\/speech>/);
        if (speechMatch && shouldPlaySpeech) {
            const speechContent = speechMatch[1].trim();
            try {
                // 尝试解析 JSON（如果包含 instructions）
                let speechText = speechContent;
                let instructions = '';

                try {
                    const parsed = JSON.parse(speechContent);
                    if (parsed.speech) {
                        speechText = parsed.speech;
                        instructions = parsed.instructions || '';
                    }
                } catch {
                    // 如果不是 JSON，直接使用文本
                }

                // 生成并播放语音（字幕会在音频开始播放时自动开始流式显示）
                await playSpeech(speechText, instructions, speechText);
                
                // 字幕保留，直到下一个字幕出现
            } catch (error) {
                console.error('Error processing speech:', error);
            }
        }

        // 提取 <screen> 标签内容（仅显示 screen 内容）
        const screenMatch = content.match(/<screen>([\s\S]*?)<\/screen>/);
        if (screenMatch) {
            setWhiteboardContent(screenMatch[1].trim());
        }
    }, [playSpeech]);

    // 监听新消息并处理
    useEffect(() => {
        const lastMessage = messages[messages.length - 1];
        if (lastMessage && lastMessage.role === 'assistant' && lastMessage.id) {
            // 从消息中提取文本内容
            let content = '';
            if (lastMessage.parts) {
                // 从 parts 中提取文本
                content = lastMessage.parts
                    .filter((part): part is { type: 'text'; text: string } => 
                        part.type === 'text' && 'text' in part && typeof (part as { text?: unknown }).text === 'string'
                    )
                    .map((part) => part.text)
                    .join('');
            }

            if (content) {
                const isStreaming = status === 'streaming';
                const messageId = lastMessage.id;
                const wasProcessed = processedMessageIdsRef.current.has(messageId);

                // 实时更新白板内容（即使正在流式传输）
                parseAndHandleMessage(content, false);

                // 只有在流式传输完成后才播放语音，且只播放一次
                if (!isStreaming && !wasProcessed) {
                    processedMessageIdsRef.current.add(messageId);
                    parseAndHandleMessage(content, true);
                }
            }
        }
    }, [messages, status, parseAndHandleMessage]);

    // 处理消息队列：当 AI 处理完成时，合并并发送队列中的消息
    useEffect(() => {
        // 检查前一个状态是否是处理中状态（submitted 或 streaming）
        const wasProcessing = previousStatusRef.current === 'submitted' || previousStatusRef.current === 'streaming';
        // 检查当前状态是否是空闲状态（ready 或 error）
        const isReady = status === 'ready' || status === 'error';
        
        // 当状态从处理中变为空闲时，处理队列
        if (wasProcessing && isReady && messageQueueRef.current.length > 0) {
            const queuedMessages = messageQueueRef.current;
            messageQueueRef.current = []; // 清空队列
            
            // 合并所有排队的消息
            const mergedText = queuedMessages.join(' ');
            
            // 发送合并后的消息
            if (mergedText.trim()) {
                sendMessage({
                    text: mergedText,
                });
            }
        }
        
        // 更新前一个状态
        previousStatusRef.current = status;
    }, [status, sendMessage]);

    // 获取可用设备
    const getAvailableDevices = useCallback(async () => {
        try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            const videoDevices = devices.filter(device => device.kind === 'videoinput');
            const audioDevices = devices.filter(device => device.kind === 'audioinput');
            
            setAvailableDevices({ videoDevices, audioDevices });
            
            // 从本地存储读取之前的选择
            const savedVideoDevice = localStorage.getItem('selectedVideoDevice');
            const savedAudioDevice = localStorage.getItem('selectedAudioDevice');
            
            if (savedVideoDevice && videoDevices.some(d => d.deviceId === savedVideoDevice)) {
                setSelectedVideoDevice(savedVideoDevice);
            } else if (videoDevices.length > 0) {
                setSelectedVideoDevice(videoDevices[0].deviceId);
            }
            
            if (savedAudioDevice && audioDevices.some(d => d.deviceId === savedAudioDevice)) {
                setSelectedAudioDevice(savedAudioDevice);
            } else if (audioDevices.length > 0) {
                setSelectedAudioDevice(audioDevices[0].deviceId);
            }
        } catch (error) {
            console.error('Error enumerating devices:', error);
        }
    }, []);

    // 初始化摄像头
    const initCamera = useCallback(async (videoDeviceId?: string, audioDeviceId?: string) => {
        try {
            // 停止现有流
            if (streamRef.current) {
                streamRef.current.getTracks().forEach(track => track.stop());
            }

            const constraints: MediaStreamConstraints = {
                video: videoDeviceId ? { deviceId: { exact: videoDeviceId } } : true,
                audio: audioDeviceId ? { deviceId: { exact: audioDeviceId } } : true,
            };

            const stream = await navigator.mediaDevices.getUserMedia(constraints);
            streamRef.current = stream;
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
            }
        } catch (error) {
            console.error('Error accessing media devices:', error);
        }
    }, []);

    // 初始化
    useEffect(() => {
        const setup = async () => {
            // 先请求权限以获取设备标签
            try {
                await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
                await getAvailableDevices();
            } catch (error) {
                console.error('Error requesting permissions:', error);
            }
        };

        setup();

        return () => {
            if (streamRef.current) {
                streamRef.current.getTracks().forEach(track => track.stop());
            }
        };
    }, [getAvailableDevices]);

    // 当设备选择改变时重新初始化
    useEffect(() => {
        if (selectedVideoDevice || selectedAudioDevice) {
            initCamera(selectedVideoDevice || undefined, selectedAudioDevice || undefined);
        }
    }, [selectedVideoDevice, selectedAudioDevice, initCamera]);

    // 切换视频
    const toggleVideo = useCallback(() => {
        if (streamRef.current) {
            const videoTrack = streamRef.current.getVideoTracks()[0];
            if (videoTrack) {
                videoTrack.enabled = !isVideoEnabled;
                setIsVideoEnabled(!isVideoEnabled);
            }
        }
    }, [isVideoEnabled]);

    // 转录音频并发送消息
    const transcribeAndSend = useCallback(async (audioBlob: Blob) => {
        try {
            setIsTranscribing(true);
            
            const formData = new FormData();
            formData.append('file', audioBlob, 'audio.webm');

            const response = await fetch('/api/transcribe', {
                method: 'POST',
                body: formData,
            });

            if (!response.ok) {
                throw new Error('Transcription failed');
            }

            const { text } = await response.json();

            if (text) {
                // 显示候选人字幕（保留直到下一个字幕出现）
                setCandidateSpeechText(text);
                
                // 添加时间戳到文本前
                const timestamp = new Date().toString();
                const textWithTimestamp = `[${timestamp}] ${text}`;
                
                // 如果 AI 正在处理请求（submitted 或 streaming），将消息加入队列
                if (status === 'submitted' || status === 'streaming') {
                    messageQueueRef.current.push(textWithTimestamp);
                } else {
                    // 否则立即发送
                    await sendMessage({
                        text: textWithTimestamp,
                    });
                }
            }
        } catch (error) {
            console.error('Error transcribing audio:', error);
        } finally {
            setIsTranscribing(false);
        }
    }, [sendMessage, status]);

    // 开始录音
    const startRecording = useCallback(() => {
        if (streamRef.current && !isRecording) {
            // 停止当前正在播放的面试官声音
            if (currentAudioRef.current) {
                currentAudioRef.current.pause();
                currentAudioRef.current.currentTime = 0;
                // 清理之前的 URL
                if (currentAudioRef.current.src.startsWith('blob:')) {
                    URL.revokeObjectURL(currentAudioRef.current.src);
                }
                currentAudioRef.current = null;
                setIsProcessingSpeech(false);
            }

            const audioTrack = streamRef.current.getAudioTracks()[0];
            if (audioTrack) {
                const mediaRecorder = new MediaRecorder(streamRef.current);
                mediaRecorderRef.current = mediaRecorder;
                audioChunksRef.current = [];

                mediaRecorder.ondataavailable = (event) => {
                    if (event.data.size > 0) {
                        audioChunksRef.current.push(event.data);
                    }
                };

                mediaRecorder.onstop = async () => {
                    const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
                    await transcribeAndSend(audioBlob);
                };

                mediaRecorder.start();
                setIsRecording(true);
            }
        }
    }, [isRecording, transcribeAndSend]);

    // 停止录音并转录
    const stopRecording = useCallback(() => {
        if (mediaRecorderRef.current && isRecording) {
            mediaRecorderRef.current.stop();
            setIsRecording(false);
        }
    }, [isRecording]);

    // 键盘事件处理：空格键录音
    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            // 只在按下空格键时触发，且不在输入框中
            if (event.code === 'Space' && !isRecording) {
                const target = event.target as HTMLElement;
                // 如果焦点在输入框、文本区域或可编辑元素上，不触发
                if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
                    return;
                }
                
                // 阻止默认行为（页面滚动）
                event.preventDefault();
                startRecording();
            }
        };

        const handleKeyUp = (event: KeyboardEvent) => {
            // 只在释放空格键时触发
            if (event.code === 'Space' && isRecording) {
                const target = event.target as HTMLElement;
                // 如果焦点在输入框、文本区域或可编辑元素上，不触发
                if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
                    return;
                }
                
                // 阻止默认行为
                event.preventDefault();
                stopRecording();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);

        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
        };
    }, [isRecording, startRecording, stopRecording]);

    return (
        <div className="flex flex-col h-screen max-h-screen bg-background overflow-hidden">
            {/* 主内容区域 */}
            <div className="flex-1 flex flex-col md:flex-row gap-2 md:gap-4 p-2 md:p-4 min-h-0">
                {/* 左侧：摄像头区域 */}
                <div className="flex-1 flex flex-col gap-2 md:gap-4 min-h-0 min-w-0">
                    {/* 候选人视频 */}
                    <div className="flex-1 relative bg-card rounded-lg border border-border overflow-hidden min-h-0">
                        {/* 摄像头提示横条 */}
                        <div className="absolute top-0 left-0 right-0 bg-blue-500/90 text-white px-3 py-1.5 text-xs md:text-sm text-center z-20">
                            <span className="font-medium">📹 摄像头信息仅为模拟，不会传输到服务器</span>
                        </div>
                        
                        {isVideoEnabled ? (
                            <video
                                ref={videoRef}
                                autoPlay
                                playsInline
                                muted
                                className="w-full h-full object-cover"
                            />
                        ) : (
                            <div className="w-full h-full flex items-center justify-center bg-muted">
                                <VideoOff className="w-12 h-12 md:w-24 md:h-24 text-muted-foreground" />
                            </div>
                        )}
                        {/* 录音状态提示 */}
                        {isRecording && (
                            <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 bg-destructive/90 text-destructive-foreground px-4 py-2 rounded-full text-sm font-medium flex items-center gap-2 shadow-lg z-10">
                                <div className="w-3 h-3 bg-white rounded-full animate-pulse" />
                                正在录音...
                            </div>
                        )}
                        
                        {/* 候选人字幕 */}
                        {candidateSpeechText && !isRecording && (
                            <div className="absolute bottom-4 left-0 right-0 mx-4 bg-black/80 text-white px-3 py-2 text-xs md:text-sm rounded-lg">
                                <div className="flex items-start gap-2">
                                    <span className="flex-shrink-0">🎤</span>
                                    <div className="flex-1 leading-relaxed">{candidateSpeechText}</div>
                                </div>
                            </div>
                        )}
                        {candidateSpeechText && isRecording && (
                            <div className="absolute bottom-20 left-0 right-0 mx-4 bg-black/80 text-white px-3 py-2 text-xs md:text-sm rounded-lg">
                                <div className="flex items-start gap-2">
                                    <span className="flex-shrink-0">🎤</span>
                                    <div className="flex-1 leading-relaxed">{candidateSpeechText}</div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* 面试官区域 */}
                    <div className="h-32 md:h-48 relative bg-card rounded-lg border border-border overflow-hidden flex flex-col flex-shrink-0">
                        {/* 状态指示条 */}
                        <div className={cn(
                            "absolute top-0 left-0 right-0 px-3 py-2 flex items-center gap-2 z-10 transition-colors",
                            status === 'streaming' 
                                ? "bg-blue-500/90 text-white" 
                                : isProcessingSpeech 
                                    ? "bg-green-500/90 text-white" 
                                    : isTranscribing
                                        ? "bg-purple-500/90 text-white"
                                        : "bg-muted text-muted-foreground"
                        )}>
                            {status === 'streaming' ? (
                                <>
                                    <Brain className="w-4 h-4 md:w-5 md:h-5 animate-pulse" />
                                    <span className="text-sm md:text-base font-semibold">正在思考...</span>
                                </>
                            ) : isProcessingSpeech ? (
                                <>
                                    <MessageCircle className="w-4 h-4 md:w-5 md:h-5 animate-pulse" />
                                    <span className="text-sm md:text-base font-semibold">正在说话...</span>
                                </>
                            ) : isTranscribing ? (
                                <>
                                    <Mic className="w-4 h-4 md:w-5 md:h-5 animate-pulse" />
                                    <span className="text-sm md:text-base font-semibold">正在转录...</span>
                                </>
                            ) : (
                                <>
                                    <Clock className="w-4 h-4 md:w-5 md:h-5" />
                                    <span className="text-sm md:text-base font-semibold">等待中</span>
                                </>
                            )}
                        </div>

                        {/* 动画和状态 */}
                        <div className="flex-1 flex items-center justify-center pt-8 md:pt-10">
                            <div className="relative w-24 h-24 md:w-32 md:h-32">
                                {/* 旋转动画圆圈 - 根据状态改变颜色和速度 */}
                                {status === 'streaming' ? (
                                    <>
                                        <div className="absolute inset-0 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
                                        <div className="absolute inset-2 md:inset-4 border-4 border-blue-300 border-t-transparent rounded-full animate-spin" style={{ animationDirection: 'reverse', animationDuration: '1.5s' }} />
                                    </>
                                ) : isProcessingSpeech ? (
                                    <>
                                        <div className="absolute inset-0 border-4 border-green-500 border-t-transparent rounded-full animate-spin" style={{ animationDuration: '2s' }} />
                                        <div className="absolute inset-2 md:inset-4 border-4 border-green-300 border-t-transparent rounded-full animate-spin" style={{ animationDirection: 'reverse', animationDuration: '3s' }} />
                                    </>
                                ) : isTranscribing ? (
                                    <>
                                        <div className="absolute inset-0 border-4 border-purple-500 border-t-transparent rounded-full animate-spin" style={{ animationDuration: '2.5s' }} />
                                        <div className="absolute inset-2 md:inset-4 border-4 border-purple-300 border-t-transparent rounded-full animate-spin" style={{ animationDirection: 'reverse', animationDuration: '3.5s' }} />
                                    </>
                                ) : (
                                    <>
                                        <div className="absolute inset-0 border-4 border-primary border-t-transparent rounded-full animate-spin" style={{ animationDuration: '3s' }} />
                                        <div className="absolute inset-2 md:inset-4 border-4 border-secondary border-t-transparent rounded-full animate-spin" style={{ animationDirection: 'reverse', animationDuration: '4s' }} />
                                    </>
                                )}

                                {/* 中心图标或文字 */}
                                <div className="absolute inset-0 flex items-center justify-center">
                                    <div className="text-center">
                                        <div className="text-xl md:text-2xl font-bold text-primary">面试官</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                        
                        {/* 字幕区域 */}
                        {currentSpeechText && (
                            <div className="absolute bottom-0 left-0 right-0 bg-black/80 text-white px-3 py-2 text-xs md:text-sm">
                                <div className="flex items-start gap-2">
                                    <span className="animate-pulse flex-shrink-0">💬</span>
                                    <div className="flex-1 leading-relaxed overflow-y-auto max-h-16" style={{ scrollbarWidth: 'thin' }}>
                                        {currentSpeechText}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* 右侧：白板区域 */}
                <div className="flex-1 bg-card rounded-lg border border-border p-3 md:p-6 min-h-0 min-w-0 flex flex-col">
                    <div className="flex-1 min-h-0 overflow-hidden">
                        <div className="h-full overflow-y-auto prose prose-sm max-w-none dark:prose-invert text-foreground text-sm md:text-base">
                            {whiteboardContent ? (
                                <ReactMarkdown
                                    components={{
                                        // 自定义样式
                                        h1: ({ ...props }) => <h1 className="text-2xl font-bold mb-4 mt-6" {...props} />,
                                        h2: ({ ...props }) => <h2 className="text-xl font-bold mb-3 mt-5" {...props} />,
                                        h3: ({ ...props }) => <h3 className="text-lg font-bold mb-2 mt-4" {...props} />,
                                        p: ({ ...props }) => <p className="mb-3 leading-relaxed" {...props} />,
                                        ul: ({ ...props }) => <ul className="list-disc list-inside mb-3 space-y-1" {...props} />,
                                        ol: ({ ...props }) => <ol className="list-decimal list-inside mb-3 space-y-1" {...props} />,
                                        li: ({ ...props }) => <li className="ml-4" {...props} />,
                                        code: ({ inline, children, ...props }: { inline?: boolean; children?: React.ReactNode }) => 
                                            inline ? (
                                                <code className="bg-muted px-1.5 py-0.5 rounded text-sm font-mono" {...props}>{children}</code>
                                            ) : (
                                                <code className="block bg-muted p-3 rounded text-sm font-mono overflow-x-auto mb-3" {...props}>{children}</code>
                                            ),
                                        pre: ({ ...props }) => <pre className="bg-muted p-3 rounded text-sm font-mono overflow-x-auto mb-3" {...props} />,
                                        blockquote: ({ ...props }) => <blockquote className="border-l-4 border-primary pl-4 italic my-3" {...props} />,
                                        a: ({ ...props }) => <a className="text-primary hover:underline" {...props} />,
                                        strong: ({ ...props }) => <strong className="font-bold" {...props} />,
                                        em: ({ ...props }) => <em className="italic" {...props} />,
                                    }}
                                >
                                    {whiteboardContent}
                                </ReactMarkdown>
                            ) : (
                                <div className="text-muted-foreground text-center py-8 md:py-12">
                                    <p className="text-sm md:text-base">白板区域</p>
                                    <p className="text-xs md:text-sm mt-2">面试官的内容将显示在这里</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* 底部操作栏 */}
            <div className="border-t border-border bg-card p-2 md:p-4 flex-shrink-0">
                <div className="flex items-center justify-center gap-2 md:gap-4">
                    {/* 视频控制 */}
                    <button
                        onClick={toggleVideo}
                        className={cn(
                            "flex items-center justify-center w-10 h-10 md:w-12 md:h-12 rounded-full transition-colors",
                            isVideoEnabled
                                ? "bg-primary text-primary-foreground hover:bg-primary/90"
                                : "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        )}
                        aria-label={isVideoEnabled ? "关闭摄像头" : "打开摄像头"}
                    >
                        {isVideoEnabled ? <Video className="w-4 h-4 md:w-5 md:h-5" /> : <VideoOff className="w-4 h-4 md:w-5 md:h-5" />}
                    </button>

                    {/* 录音按钮（按住说话） */}
                    <button
                        onMouseDown={startRecording}
                        onMouseUp={stopRecording}
                        onTouchStart={startRecording}
                        onTouchEnd={stopRecording}
                        className={cn(
                            "flex items-center justify-center w-14 h-14 md:w-16 md:h-16 rounded-full transition-colors",
                            isRecording
                                ? "bg-destructive text-destructive-foreground hover:bg-destructive/90 animate-pulse"
                                : "bg-primary text-primary-foreground hover:bg-primary/90"
                        )}
                        aria-label="按住说话"
                    >
                        <Mic className="w-5 h-5 md:w-6 md:h-6" />
                    </button>

                    {/* 设置按钮 */}
                    <button
                        onClick={() => setShowSettings(true)}
                        className="flex items-center justify-center w-10 h-10 md:w-12 md:h-12 rounded-full bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors"
                        aria-label="设置"
                    >
                        <Settings className="w-4 h-4 md:w-5 md:h-5" />
                    </button>

                    {/* 主题切换按钮 */}
                    <button
                        onClick={toggleTheme}
                        className="flex items-center justify-center w-10 h-10 md:w-12 md:h-12 rounded-full bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors"
                        aria-label={isDarkMode ? "切换到浅色模式" : "切换到深色模式"}
                    >
                        {isDarkMode ? <Sun className="w-4 h-4 md:w-5 md:h-5" /> : <Moon className="w-4 h-4 md:w-5 md:h-5" />}
                    </button>
                </div>
            </div>

            {/* 设置对话框 */}
            {showSettings && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowSettings(false)}>
                    <div className="bg-card border border-border rounded-lg p-6 max-w-md w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-xl font-semibold">设备设置</h2>
                            <button
                                onClick={() => setShowSettings(false)}
                                className="p-1 hover:bg-muted rounded transition-colors"
                                aria-label="关闭"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="space-y-4">
                            {/* 摄像头选择 */}
                            <div>
                                <label className="block text-sm font-medium mb-2">摄像头</label>
                                <select
                                    value={selectedVideoDevice}
                                    onChange={(e) => {
                                        setSelectedVideoDevice(e.target.value);
                                        localStorage.setItem('selectedVideoDevice', e.target.value);
                                    }}
                                    className="w-full p-2 border border-border rounded-md bg-background text-foreground"
                                >
                                    {availableDevices.videoDevices.map((device) => (
                                        <option key={device.deviceId} value={device.deviceId}>
                                            {device.label || `摄像头 ${device.deviceId.slice(0, 8)}`}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            {/* 麦克风选择 */}
                            <div>
                                <label className="block text-sm font-medium mb-2">麦克风</label>
                                <select
                                    value={selectedAudioDevice}
                                    onChange={(e) => {
                                        setSelectedAudioDevice(e.target.value);
                                        localStorage.setItem('selectedAudioDevice', e.target.value);
                                    }}
                                    className="w-full p-2 border border-border rounded-md bg-background text-foreground"
                                >
                                    {availableDevices.audioDevices.map((device) => (
                                        <option key={device.deviceId} value={device.deviceId}>
                                            {device.label || `麦克风 ${device.deviceId.slice(0, 8)}`}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            {/* 刷新设备列表按钮 */}
                            <button
                                onClick={async () => {
                                    await getAvailableDevices();
                                }}
                                className="w-full p-2 bg-secondary text-secondary-foreground rounded-md hover:bg-secondary/80 transition-colors"
                            >
                                刷新设备列表
                            </button>

                            {/* 确认按钮 */}
                            <button
                                onClick={() => {
                                    initCamera(selectedVideoDevice || undefined, selectedAudioDevice || undefined);
                                    setShowSettings(false);
                                }}
                                className="w-full p-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors flex items-center justify-center gap-2"
                            >
                                <Check className="w-4 h-4" />
                                应用设置
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

