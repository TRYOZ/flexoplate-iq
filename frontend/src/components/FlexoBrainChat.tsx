'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  MessageCircle,
  X,
  Send,
  Loader2,
  Bot,
  User,
  Minimize2,
  Maximize2,
  Sparkles,
  ChevronDown,
} from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

// Types
interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  toolCalls?: ToolCall[];
}

interface ToolCall {
  tool: string;
  args: Record<string, unknown>;
  result: Record<string, unknown>;
}

interface ChatContext {
  page?: string;
  selectedPlate?: {
    id: string;
    name: string;
    supplier: string;
  };
  filters?: Record<string, unknown>;
}

interface FlexoBrainChatProps {
  context?: ChatContext;
  initialMessage?: string;
  position?: 'bottom-right' | 'bottom-left';
  onPlateSelect?: (plateId: string) => void;
}

// Suggested questions based on context
const getSuggestedQuestions = (context?: ChatContext): string[] => {
  const page = context?.page || '';

  if (page === 'equivalency' || page === 'plates') {
    return [
      'What flat-top plate would you recommend for flexible packaging?',
      'Compare XSYS nyloflex FTF vs DuPont Cyrel EASY',
      'Which plate is best for corrugated postprint?',
      'Help me find an equivalent to Cyrel EASY 1.14',
    ];
  }

  if (page === 'exposure') {
    return [
      'How do I calculate exposure time for my plate?',
      'What causes over-exposure symptoms?',
      'How often should I replace my UV lamps?',
      'Explain the difference between LED and fluorescent UV',
    ];
  }

  return [
    'What is flat-top dot technology?',
    'Compare solvent vs thermal plate processing',
    'Help me find a plate for my application',
    'What causes dot gain in flexo printing?',
  ];
};

export default function FlexoBrainChat({
  context,
  initialMessage,
  position = 'bottom-right',
  onPlateSelect,
}: FlexoBrainChatProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(true);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen && !isMinimized) {
      inputRef.current?.focus();
    }
  }, [isOpen, isMinimized]);

  // Add initial message if provided
  useEffect(() => {
    if (initialMessage && messages.length === 0) {
      handleSend(initialMessage);
    }
  }, [initialMessage]);

  const handleSend = async (messageText?: string) => {
    const text = messageText || inputValue.trim();
    if (!text || isLoading) return;

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputValue('');
    setShowSuggestions(false);
    setIsLoading(true);

    try {
      const response = await fetch(`${API_URL}/api/agent/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: [...messages, userMessage].map((m) => ({
            role: m.role,
            content: m.content,
          })),
          context: context,
          stream: false,
        }),
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const data = await response.json();

      const assistantMessage: Message = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: data.message,
        timestamp: new Date(),
        toolCalls: data.tool_calls,
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (error) {
      console.error('Chat error:', error);
      const errorMessage: Message = {
        id: `error-${Date.now()}`,
        role: 'assistant',
        content:
          'Sorry, I encountered an error. Please make sure the FlexoBrain API is running and configured with an OpenAI API key.',
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const formatToolCall = (toolCall: ToolCall) => {
    const toolNames: Record<string, string> = {
      search_plates: 'Searched plates',
      find_equivalent_plates: 'Found equivalents',
      get_plate_details: 'Retrieved plate details',
      calculate_exposure: 'Calculated exposure',
      get_equipment_info: 'Retrieved equipment info',
      troubleshoot_issue: 'Analyzed issue',
      search_knowledge_base: 'Searched knowledge base',
    };

    return toolNames[toolCall.tool] || toolCall.tool;
  };

  const positionClasses =
    position === 'bottom-right' ? 'right-4 sm:right-6' : 'left-4 sm:left-6';

  // Collapsed state - just the button
  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className={`fixed bottom-4 sm:bottom-6 ${positionClasses} z-50 flex items-center gap-2 px-4 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-full shadow-lg hover:shadow-xl transition-all duration-200 hover:scale-105 group`}
      >
        <Bot className="w-5 h-5" />
        <span className="font-medium">FlexoBrain</span>
        <Sparkles className="w-4 h-4 opacity-75 group-hover:opacity-100" />
      </button>
    );
  }

  // Minimized state
  if (isMinimized) {
    return (
      <div
        className={`fixed bottom-4 sm:bottom-6 ${positionClasses} z-50 flex items-center gap-2 px-4 py-3 bg-white border border-gray-200 rounded-full shadow-lg cursor-pointer hover:shadow-xl transition-all duration-200`}
        onClick={() => setIsMinimized(false)}
      >
        <Bot className="w-5 h-5 text-blue-600" />
        <span className="font-medium text-gray-700">FlexoBrain</span>
        {messages.length > 0 && (
          <span className="bg-blue-100 text-blue-600 text-xs px-2 py-0.5 rounded-full">
            {messages.length}
          </span>
        )}
        <Maximize2 className="w-4 h-4 text-gray-400" />
      </div>
    );
  }

  // Full chat interface
  return (
    <div
      className={`fixed bottom-4 sm:bottom-6 ${positionClasses} z-50 w-[calc(100vw-2rem)] sm:w-[420px] h-[600px] max-h-[calc(100vh-3rem)] bg-white rounded-2xl shadow-2xl border border-gray-200 flex flex-col overflow-hidden`}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white">
        <div className="flex items-center gap-2">
          <Bot className="w-6 h-6" />
          <div>
            <h3 className="font-semibold">FlexoBrain</h3>
            <p className="text-xs text-blue-100">Flexographic Printing Expert</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setIsMinimized(true)}
            className="p-1.5 hover:bg-white/20 rounded-lg transition-colors"
            title="Minimize"
          >
            <Minimize2 className="w-4 h-4" />
          </button>
          <button
            onClick={() => setIsOpen(false)}
            className="p-1.5 hover:bg-white/20 rounded-lg transition-colors"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50">
        {/* Welcome message */}
        {messages.length === 0 && (
          <div className="text-center py-6">
            <div className="w-16 h-16 bg-gradient-to-br from-blue-100 to-indigo-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Bot className="w-8 h-8 text-blue-600" />
            </div>
            <h4 className="font-semibold text-gray-800 mb-2">
              Hi! I&apos;m FlexoBrain
            </h4>
            <p className="text-sm text-gray-600 mb-4">
              Your AI expert for flexographic plates, processing, equipment, and
              troubleshooting. How can I help you today?
            </p>

            {/* Suggested questions */}
            {showSuggestions && (
              <div className="space-y-2">
                <p className="text-xs text-gray-500 uppercase tracking-wide">
                  Try asking:
                </p>
                {getSuggestedQuestions(context).map((question, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleSend(question)}
                    className="block w-full text-left text-sm px-3 py-2 bg-white border border-gray-200 rounded-lg hover:border-blue-300 hover:bg-blue-50 transition-colors"
                  >
                    {question}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Message list */}
        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex gap-3 ${
              message.role === 'user' ? 'flex-row-reverse' : ''
            }`}
          >
            {/* Avatar */}
            <div
              className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
                message.role === 'user'
                  ? 'bg-gray-200'
                  : 'bg-gradient-to-br from-blue-500 to-indigo-500'
              }`}
            >
              {message.role === 'user' ? (
                <User className="w-4 h-4 text-gray-600" />
              ) : (
                <Bot className="w-4 h-4 text-white" />
              )}
            </div>

            {/* Message content */}
            <div
              className={`flex-1 max-w-[80%] ${
                message.role === 'user' ? 'text-right' : ''
              }`}
            >
              <div
                className={`inline-block px-4 py-2 rounded-2xl ${
                  message.role === 'user'
                    ? 'bg-blue-600 text-white rounded-br-md'
                    : 'bg-white border border-gray-200 text-gray-800 rounded-bl-md shadow-sm'
                }`}
              >
                <p className="text-sm whitespace-pre-wrap">{message.content}</p>
              </div>

              {/* Tool calls indicator */}
              {message.toolCalls && message.toolCalls.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {message.toolCalls.map((tc, idx) => (
                    <span
                      key={idx}
                      className="inline-flex items-center gap-1 text-xs px-2 py-0.5 bg-blue-50 text-blue-600 rounded-full"
                    >
                      <Sparkles className="w-3 h-3" />
                      {formatToolCall(tc)}
                    </span>
                  ))}
                </div>
              )}

              <p className="text-xs text-gray-400 mt-1">
                {message.timestamp.toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </p>
            </div>
          </div>
        ))}

        {/* Loading indicator */}
        {isLoading && (
          <div className="flex gap-3">
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-indigo-500 flex items-center justify-center">
              <Bot className="w-4 h-4 text-white" />
            </div>
            <div className="bg-white border border-gray-200 rounded-2xl rounded-bl-md px-4 py-3 shadow-sm">
              <div className="flex items-center gap-2 text-gray-500">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-sm">Thinking...</span>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="p-4 bg-white border-t border-gray-200">
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about plates, processing, troubleshooting..."
            className="flex-1 resize-none border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent max-h-32"
            rows={1}
            disabled={isLoading}
          />
          <button
            onClick={() => handleSend()}
            disabled={!inputValue.trim() || isLoading}
            className="flex-shrink-0 p-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isLoading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Send className="w-5 h-5" />
            )}
          </button>
        </div>
        <p className="text-xs text-gray-400 mt-2 text-center">
          FlexoBrain may make mistakes. Verify important information.
        </p>
      </div>
    </div>
  );
}
