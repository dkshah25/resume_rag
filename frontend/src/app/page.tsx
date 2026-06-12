"use client";

import React, { useState, useRef, useEffect } from "react";
import { 
  Upload, 
  FileText, 
  Send, 
  CheckCircle2, 
  AlertCircle, 
  Briefcase, 
  GraduationCap, 
  Award, 
  Layers, 
  FolderOpen, 
  FileUser, 
  FileSearch, 
  CalendarClock, 
  RefreshCw
} from "lucide-react";

interface ExtractedData {
  skills: string[];
  experience_years: number | string;
  projects: string[];
  education: string[];
  certifications: string[];
}

interface Message {
  role: "user" | "assistant";
  content: string;
  source?: string;
  timestamp: Date;
}

const SUGGESTED_QUESTIONS = [
  "Summarize this candidate",
  "What skills does this candidate have?",
  "What projects has this candidate worked on?",
  "How many years of experience does this person have?",
  "What certifications does this candidate have?",
  "What education does this candidate have?"
];

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export default function Home() {
  // Upload State
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<"idle" | "success" | "error">("idle");
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [pages, setPages] = useState<number>(0);
  const [characters, setCharacters] = useState<number>(0);

  // Extracted Data State
  const [extractedData, setExtractedData] = useState<ExtractedData | null>(null);

  // Q&A State
  const [messages, setMessages] = useState<Message[]>([]);
  const [question, setQuestion] = useState("");
  const [isAsking, setIsAsking] = useState(false);
  
  // Drag and Drop Area Hover State
  const [dragActive, setDragActive] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll chat to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Drag handlers
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const droppedFile = e.dataTransfer.files[0];
      handleFileSelected(droppedFile);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFileSelected(e.target.files[0]);
    }
  };

  const handleFileSelected = (selectedFile: File) => {
    const ext = selectedFile.name.split(".").pop()?.toLowerCase();
    if (ext !== "pdf" && ext !== "docx") {
      setUploadStatus("error");
      setUploadError("Only PDF and DOCX files are supported.");
      setFile(null);
      return;
    }
    
    setFile(selectedFile);
    setUploadStatus("idle");
    setUploadError(null);
    // Automatically trigger upload once file is selected
    uploadFile(selectedFile);
  };

  const uploadFile = async (fileToUpload: File) => {
    setIsUploading(true);
    setUploadStatus("idle");
    setUploadError(null);
    setExtractedData(null);
    setMessages([]);

    const formData = new FormData();
    formData.append("file", fileToUpload);

    try {
      const response = await fetch(`${API_URL}/upload`, {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || "Failed to upload and parse resume.");
      }

      setUploadStatus("success");
      setPages(data.pages);
      setCharacters(data.characters);
      if (data.extracted_data) {
        setExtractedData(data.extracted_data);
      }
      
      // Add system greeting message in chat
      setMessages([
        {
          role: "assistant",
          content: `Successfully analyzed **${fileToUpload.name}** (${data.pages} page${data.pages > 1 ? "s" : ""}, ${data.characters} characters). I have indexed the resume content using a FAISS vector database. \n\nYou can view the extracted details in the sidebar panel. What would you like to know about this candidate?`,
          timestamp: new Date()
        }
      ]);
    } catch (err: any) {
      console.error(err);
      setUploadStatus("error");
      setUploadError(err.message || "An unexpected error occurred.");
    } finally {
      setIsUploading(false);
    }
  };

  const handleAsk = async (questionText: string) => {
    const query = questionText.trim();
    if (!query) return;

    // Add user message to chat
    const userMsg: Message = {
      role: "user",
      content: query,
      timestamp: new Date()
    };
    setMessages(prev => [...prev, userMsg]);
    setQuestion("");
    setIsAsking(true);

    try {
      const response = await fetch(`${API_URL}/ask`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ question: query }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || "Failed to fetch response from agent.");
      }

      // Add assistant message with citation
      const assistantMsg: Message = {
        role: "assistant",
        content: data.answer,
        source: data.source || undefined,
        timestamp: new Date()
      };
      setMessages(prev => [...prev, assistantMsg]);
    } catch (err: any) {
      console.error(err);
      const errorMsg: Message = {
        role: "assistant",
        content: `Error: ${err.message || "Could not reach the server. Make sure the backend is running."}`,
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setIsAsking(false);
    }
  };

  const handleSuggestionClick = (suggestion: string) => {
    if (isUploading || isAsking || !file) return;
    handleAsk(suggestion);
  };

  const triggerFileSelect = () => {
    fileInputRef.current?.click();
  };

  const handleReset = () => {
    setFile(null);
    setUploadStatus("idle");
    setUploadError(null);
    setExtractedData(null);
    setMessages([]);
    setQuestion("");
  };

  return (
    <div className="flex h-screen bg-[#070A13] text-slate-100 overflow-hidden font-sans">
      {/* 1. LEFT SIDEBAR PANEL: Extracted Information */}
      <aside className="w-80 md:w-96 bg-[#0C1222] border-r border-[#1B2744] flex flex-col overflow-hidden shrink-0">
        {/* Sidebar Header */}
        <div className="p-6 border-b border-[#1B2744] bg-[#0E1528] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-violet-600/10 text-violet-400 rounded-xl border border-violet-500/20 flex items-center justify-center shrink-0">
              <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
                <polyline points="14 2 14 8 20 8" />
                <circle cx="16" cy="16" r="3" fill="#0C1222" />
                <line x1="18.5" y1="18.5" x2="21" y2="21" />
              </svg>
            </div>
            <div>
              <h1 className="font-bold text-lg tracking-tight text-white flex items-center gap-1.5">
                HireLens AI
              </h1>
              <p className="text-xs text-slate-400">Smart Resume Matcher</p>
            </div>
          </div>
          {file && (
            <button 
              onClick={handleReset} 
              className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors border border-[#1B2744] hover:border-red-500/20"
              title="Reset Upload"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Sidebar Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 scrollbar-thin scrollbar-thumb-[#1B2744]">
          {/* If no file has been uploaded */}
          {!extractedData ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-4 space-y-4">
              <div className="w-16 h-16 rounded-full bg-[#121B32] border border-[#1B2744] flex items-center justify-center text-slate-500">
                <FileText className="w-8 h-8" />
              </div>
              <div>
                <h3 className="font-medium text-slate-300">No active candidate</h3>
                <p className="text-sm text-slate-500 mt-1">
                  Upload a PDF or DOCX resume to view structured parameters automatically.
                </p>
              </div>
              
              <div className="w-full space-y-3 pt-2">
                {/* Features Checkbox list */}
                <div className="p-4 bg-[#111A30]/20 border border-[#1B2744] rounded-xl text-left space-y-2">
                  <h4 className="text-[10px] uppercase tracking-widest text-violet-400 font-bold">Platform Capabilities</h4>
                  <ul className="space-y-1.5 text-xs text-slate-300">
                    <li className="flex items-center gap-2">
                      <span className="text-emerald-400 font-bold">✓</span> PDF Support
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="text-emerald-400 font-bold">✓</span> DOCX Support
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="text-emerald-400 font-bold">✓</span> Semantic Search
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="text-emerald-400 font-bold">✓</span> Source-Cited Answers
                    </li>
                  </ul>
                </div>

                {/* Candidate Overview list */}
                <div className="p-4 bg-[#111A30]/10 border border-[#1E2E50]/40 rounded-xl text-left space-y-2.5">
                  <h4 className="text-[10px] uppercase tracking-widest text-slate-400 font-bold">Candidate Parameters</h4>
                  <ul className="space-y-1.5 text-xs text-slate-400">
                    <li className="flex items-center gap-1.5">
                      <span className="w-1 h-1 rounded-full bg-violet-400"></span> Skills Matrix
                    </li>
                    <li className="flex items-center gap-1.5">
                      <span className="w-1 h-1 rounded-full bg-violet-400"></span> Career Timeline
                    </li>
                    <li className="flex items-center gap-1.5">
                      <span className="w-1 h-1 rounded-full bg-violet-400"></span> Project Portfolio
                    </li>
                    <li className="flex items-center gap-1.5">
                      <span className="w-1 h-1 rounded-full bg-violet-400"></span> Education Background
                    </li>
                    <li className="flex items-center gap-1.5">
                      <span className="w-1 h-1 rounded-full bg-violet-400"></span> Verified Credentials
                    </li>
                  </ul>
                  <p className="text-[9px] text-slate-500 italic mt-2 border-t border-[#1E2E50]/20 pt-1.5 text-center">
                    Will populate automatically after upload.
                  </p>
                </div>
              </div>
            </div>
          ) : (
            // Extracted Info Dashboard
            <div className="space-y-6">
              {/* Candidate Info Block */}
              <div className="p-4 bg-[#111A30] border border-[#1B2744] rounded-xl flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-violet-500/10 text-violet-400 border border-violet-500/20 flex items-center justify-center">
                  <FileUser className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-xs uppercase tracking-widest text-slate-400 font-semibold">Active File</h4>
                  <p className="text-sm font-medium text-slate-200 truncate max-w-[200px]" title={file?.name}>
                    {file?.name}
                  </p>
                </div>
              </div>

              {/* Experience Parameter */}
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-violet-400 font-semibold text-sm">
                  <CalendarClock className="w-4 h-4" />
                  <span>Total Experience</span>
                </div>
                <div className="p-3 bg-[#111A30]/50 border border-[#1E2E50] rounded-xl">
                  <span className="text-2xl font-bold text-emerald-400">{extractedData.experience_years}</span>
                  <span className="text-xs text-slate-400 ml-1.5">Years of Experience</span>
                </div>
              </div>

              {/* Skills Parameter */}
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-violet-400 font-semibold text-sm">
                  <Layers className="w-4 h-4" />
                  <span>Technical & Soft Skills</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {extractedData.skills.length > 0 ? (
                    extractedData.skills.map((skill, i) => (
                      <span 
                        key={i} 
                        className="px-2.5 py-1 text-xs font-medium bg-[#131E37] text-slate-300 border border-[#203259] rounded-lg hover:border-violet-500/30 transition-colors"
                      >
                        {skill}
                      </span>
                    ))
                  ) : (
                    <span className="text-sm text-slate-500 italic">None identified</span>
                  )}
                </div>
              </div>

              {/* Projects Parameter */}
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-violet-400 font-semibold text-sm">
                  <FolderOpen className="w-4 h-4" />
                  <span>Key Projects</span>
                </div>
                <ul className="space-y-2.5">
                  {extractedData.projects.length > 0 ? (
                    extractedData.projects.map((proj, i) => (
                      <li key={i} className="flex gap-2 text-sm text-slate-300 bg-[#111A30]/30 p-2.5 border border-[#1E2E50]/50 rounded-xl items-start">
                        <span className="text-violet-400 shrink-0 mr-1.5 font-bold">•</span>
                        <span>{proj}</span>
                      </li>
                    ))
                  ) : (
                    <span className="text-sm text-slate-500 italic">None identified</span>
                  )}
                </ul>
              </div>

              {/* Education Parameter */}
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-violet-400 font-semibold text-sm">
                  <GraduationCap className="w-4 h-4" />
                  <span>Education</span>
                </div>
                <ul className="space-y-2.5">
                  {extractedData.education.length > 0 ? (
                    extractedData.education.map((edu, i) => (
                      <li key={i} className="flex gap-2 text-sm text-slate-300 bg-[#111A30]/30 p-2.5 border border-[#1E2E50]/50 rounded-xl items-start">
                        <span className="text-violet-400 shrink-0 mr-1.5 font-bold">•</span>
                        <span>{edu}</span>
                      </li>
                    ))
                  ) : (
                    <span className="text-sm text-slate-500 italic">None identified</span>
                  )}
                </ul>
              </div>

              {/* Certifications Parameter */}
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-violet-400 font-semibold text-sm">
                  <Award className="w-4 h-4" />
                  <span>Certifications</span>
                </div>
                <ul className="space-y-2.5">
                  {extractedData.certifications.length > 0 ? (
                    extractedData.certifications.map((cert, i) => (
                      <li key={i} className="flex gap-2 text-sm text-slate-300 bg-[#111A30]/30 p-2.5 border border-[#1E2E50]/50 rounded-xl items-start">
                        <span className="text-emerald-400 shrink-0 mr-1.5 font-bold">•</span>
                        <span>{cert}</span>
                      </li>
                    ))
                  ) : (
                    <span className="text-sm text-slate-500 italic">None identified</span>
                  )}
                </ul>
              </div>
            </div>
          )}
        </div>

        {/* Sidebar Footer */}
        {extractedData && (
          <div className="p-4 bg-[#090E1B] border-t border-[#1B2744] flex items-center justify-between text-[11px] text-slate-500">
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> Indexed
            </span>
            <span>Pages: {pages} | Chars: {characters}</span>
          </div>
        )}
      </aside>

      {/* 2. MAIN HUB: Upload Zone & ChatGPT Chat Experience */}
      <main className="flex-1 flex flex-col overflow-hidden bg-[#0A0D17]">
        {/* Top Header Bar */}
        <header className="h-16 border-b border-[#1B2744] bg-[#0E1324] px-8 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping"></span>
            <span className="text-sm font-semibold tracking-wide text-slate-200 uppercase">Interactive Workspace</span>
          </div>
          <div className="text-xs text-slate-400 bg-[#151D30] px-3.5 py-1.5 rounded-full border border-[#202E4E]">
            Model: <span className="font-semibold text-violet-400">Gemini 2.5 Flash</span>
          </div>
        </header>

        {/* Workspace Body */}
        <div className="flex-1 overflow-y-auto p-8 flex flex-col space-y-8 scrollbar-thin scrollbar-thumb-[#1B2744]">
          {/* File Upload Drop Zone */}
          <div 
            onDragEnter={handleDrag}
            onDragOver={handleDrag}
            onDragLeave={handleDrag}
            onDrop={handleDrop}
            className={`relative p-8 border-2 border-dashed rounded-2xl flex flex-col items-center justify-center text-center transition-all ${
              dragActive 
                ? "border-violet-500 bg-violet-600/5 shadow-lg shadow-violet-500/5" 
                : file 
                  ? "border-[#1B2744] bg-[#0F1527]/50" 
                  : "border-[#1E2E50] hover:border-violet-500/50 bg-[#0C1120] hover:bg-[#0E1528] cursor-pointer"
            }`}
            onClick={!file ? triggerFileSelect : undefined}
          >
            <input 
              type="file" 
              ref={fileInputRef}
              onChange={handleFileInputChange}
              accept=".pdf,.docx"
              className="hidden" 
            />

            {!file ? (
              <div className="space-y-3">
                <div className="mx-auto w-12 h-12 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center text-violet-400">
                  <Upload className="w-6 h-6 animate-bounce" />
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-200">
                    Drag and drop resume here, or <span className="text-violet-400 hover:text-violet-300 font-semibold underline decoration-dashed">browse</span>
                  </p>
                  <p className="text-xs text-slate-500 mt-1">Supports PDF and DOCX formats up to 10MB</p>
                </div>
              </div>
            ) : (
              <div className="w-full flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-3.5">
                  <div className="w-12 h-12 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center text-violet-400 shrink-0">
                    <FileText className="w-6 h-6" />
                  </div>
                  <div className="text-left">
                    <h3 className="font-semibold text-slate-200 truncate max-w-[250px] md:max-w-md">{file.name}</h3>
                    <p className="text-xs text-slate-400">{(file.size / 1024).toFixed(1)} KB</p>
                  </div>
                </div>
                
                {/* Upload Status indicators */}
                <div className="flex items-center gap-3">
                  {isUploading && (
                    <div className="flex items-center gap-2 bg-[#1A253D] px-4 py-2 rounded-xl border border-[#2A3B5F]">
                      <div className="w-4 h-4 border-2 border-violet-500 border-t-transparent rounded-full animate-spin"></div>
                      <span className="text-xs text-slate-300 font-medium">Extracting fields...</span>
                    </div>
                  )}

                  {uploadStatus === "success" && (
                    <div className="flex items-center gap-2 bg-emerald-500/10 text-emerald-400 px-4 py-2 rounded-xl border border-emerald-500/20">
                      <CheckCircle2 className="w-4.5 h-4.5" />
                      <span className="text-xs font-semibold">Indexed & Grounded</span>
                    </div>
                  )}

                  {uploadStatus === "error" && (
                    <div className="flex items-center gap-2 bg-red-500/10 text-red-400 px-4 py-2 rounded-xl border border-red-500/20">
                      <AlertCircle className="w-4.5 h-4.5" />
                      <span className="text-xs font-semibold">Parsing Failed</span>
                    </div>
                  )}
                  
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      handleReset();
                    }}
                    className="text-xs text-slate-400 hover:text-slate-200 hover:bg-[#1A253D] border border-[#1B2744] hover:border-slate-500 px-3 py-2 rounded-lg transition-colors font-medium"
                  >
                    Change File
                  </button>
                </div>
              </div>
            )}

            {uploadError && (
              <div className="mt-4 p-3 bg-red-500/5 border border-red-500/20 text-red-400 text-xs rounded-xl w-full max-w-xl text-center">
                {uploadError}
              </div>
            )}
          </div>

          {/* ChatGPT-style Chat Panel */}
          <div className="flex-1 flex flex-col min-h-[350px] bg-[#0C1222]/60 border border-[#1B2744] rounded-2xl overflow-hidden shadow-inner">
            {/* Chat Messages Log */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6 scrollbar-thin scrollbar-thumb-[#1B2744]">
              {messages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center p-8 space-y-4">
                  <div className="w-12 h-12 rounded-xl bg-violet-600/5 text-violet-400/80 border border-violet-500/10 flex items-center justify-center">
                    <FileSearch className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-slate-300 text-base">Candidate Profile Assistant</h3>
                    <p className="text-xs text-slate-500 max-w-sm mt-1 mx-auto">
                      Once you upload a resume, you can ask natural language questions about the candidate. Answers are strictly grounded in candidate content to prevent hallucinations.
                    </p>
                  </div>
                </div>
              ) : (
                messages.map((msg, index) => (
                  <div 
                    key={index} 
                    className={`flex gap-4 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                  >
                    {/* Assistant Avatar */}
                    {msg.role === "assistant" && (
                      <div className="w-9 h-9 rounded-xl bg-violet-600/10 border border-violet-500/20 flex items-center justify-center text-violet-400 shrink-0 font-bold text-xs select-none">
                        HL
                      </div>
                    )}

                    <div className="space-y-2 max-w-[80%]">
                      {/* Message Bubble */}
                      <div className={`p-4 rounded-2xl border text-sm leading-relaxed ${
                        msg.role === "user" 
                          ? "bg-violet-600/10 border-violet-500/30 text-slate-200 rounded-tr-none" 
                          : "bg-[#111A30] border-[#1E2E50] text-slate-300 rounded-tl-none"
                      }`}>
                        {/* Render simple markdown bold syntax */}
                        {msg.content.split("**").map((part, i) => i % 2 === 1 ? <strong key={i} className="text-white font-semibold">{part}</strong> : part)}
                      </div>

                      {/* Source Citation Display */}
                      {msg.role === "assistant" && msg.source && (
                        <div className="p-3 bg-slate-900/40 border border-[#1B2744] rounded-xl text-xs text-slate-400 space-y-1">
                          <div className="flex items-center gap-1.5 text-slate-400 font-semibold">
                            <FileSearch className="w-3.5 h-3.5" />
                            <span>Resume Verification Citation</span>
                          </div>
                          <p className="italic pl-1 border-l border-violet-500/30 line-clamp-3 hover:line-clamp-none transition-all duration-300">
                            "{msg.source}"
                          </p>
                        </div>
                      )}
                    </div>

                    {/* User Avatar */}
                    {msg.role === "user" && (
                      <div className="w-9 h-9 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-300 shrink-0 font-bold text-xs select-none">
                        HR
                      </div>
                    )}
                  </div>
                ))
              )}

              {/* Chat Input Waiting spinner */}
              {isAsking && (
                <div className="flex gap-4 justify-start">
                  <div className="w-9 h-9 rounded-xl bg-violet-600/10 border border-violet-500/20 flex items-center justify-center text-violet-400 shrink-0 font-bold text-xs select-none animate-pulse">
                    HL
                  </div>
                  <div className="bg-[#111A30] border-[#1E2E50] p-4 rounded-2xl rounded-tl-none max-w-[80%] text-sm text-slate-400 flex items-center gap-3">
                    <div className="flex space-x-1">
                      <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }}></span>
                      <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }}></span>
                      <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }}></span>
                    </div>
                    <span>Analyzing candidate profile...</span>
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Quick Suggestion Chips */}
            {file && uploadStatus === "success" && !isAsking && (
              <div className="px-6 py-3 border-t border-[#1B2744] bg-[#0E1528]/50 flex flex-wrap gap-2 items-center">
                <span className="text-[11px] text-slate-500 uppercase tracking-widest font-bold mr-1">Suggested Questions:</span>
                {SUGGESTED_QUESTIONS.map((q, i) => (
                  <button
                    key={i}
                    onClick={() => handleSuggestionClick(q)}
                    className="text-xs bg-[#131E37] hover:bg-violet-600/10 text-slate-300 hover:text-violet-400 border border-[#203259] hover:border-violet-500/30 px-3.5 py-1.5 rounded-full transition-colors font-medium flex items-center gap-1"
                  >
                    {q}
                  </button>
                ))}
              </div>
            )}

            {/* Chat Input Box */}
            <div className="p-4 border-t border-[#1B2744] bg-[#0C1222]">
              <form 
                onSubmit={(e) => {
                  e.preventDefault();
                  handleAsk(question);
                }}
                className="flex items-center gap-3 bg-[#111A30] border border-[#1E2E50] rounded-xl px-4 py-2.5 focus-within:border-violet-500/50 transition-colors"
              >
                <input 
                  type="text" 
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  placeholder={file && uploadStatus === "success" ? "Ask anything about this candidate..." : "Please upload a resume first to unlock chat Q&A"}
                  disabled={!file || uploadStatus !== "success" || isAsking}
                  className="flex-1 bg-transparent text-sm text-slate-100 placeholder-slate-500 outline-none disabled:cursor-not-allowed disabled:opacity-50"
                />
                <button
                  type="submit"
                  disabled={!file || uploadStatus !== "success" || isAsking || !question.trim()}
                  className="p-2 bg-violet-600 hover:bg-violet-700 text-white rounded-lg transition-colors disabled:bg-slate-800 disabled:text-slate-600 disabled:cursor-not-allowed"
                >
                  <Send className="w-4 h-4" />
                </button>
              </form>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
