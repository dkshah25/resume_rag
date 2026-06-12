import os
import logging
import json
from fastapi import FastAPI, UploadFile, File, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

# Import our custom modules
import sys
# Make sure project root is in python path to allow importing models and utils
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from models.schemas import AskRequest, AskResponse, UploadResponse, ExtractedResumeData
from utils.parser import extract_content
from utils.rag import build_faiss_index, retrieve_relevant_chunks
from utils.extractor import extract_structured_data
from langchain_google_genai import ChatGoogleGenerativeAI

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger("hirelens.backend")

app = FastAPI(
    title="HireLens AI Backend",
    description="Resume Extractor and Intelligent Q&A RAG System Backend",
    version="1.0.0"
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # For development; restrict in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# App state for active session data (Simple in-memory storage)
app.state.vector_store = None
app.state.extracted_data = None
app.state.raw_text = ""
app.state.has_uploaded = False

def get_api_key() -> str:
    """
    Retrieves the Gemini API Key from environment variables.
    Throws a 500 error if missing.
    """
    # LangChain searches for GOOGLE_API_KEY, but we support GEMINI_API_KEY as well
    api_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
    if not api_key:
        logger.error("GEMINI_API_KEY / GOOGLE_API_KEY not found in environment.")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Gemini API Key is not configured. Please add GEMINI_API_KEY to your environment variables."
        )
    return api_key

@app.get("/")
async def root():
    return {"message": "Welcome to the HireLens AI Backend API! Please use /upload and /ask endpoints."}

@app.post("/upload", response_model=UploadResponse)
async def upload_resume(file: UploadFile = File(...)):
    """
    Accepts PDF/DOCX resume file, parses text, builds FAISS vector index,
    extracts structured fields, and saves it in app state.
    """
    # 1. Validate file extension
    filename = file.filename or ""
    if not (filename.lower().endswith(".pdf") or filename.lower().endswith(".docx")):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported file format: {filename}. Only PDF and DOCX files are allowed."
        )
        
    try:
        # Read file contents
        contents = await file.read()
        if not contents:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Uploaded file is empty."
            )
            
        # 2. Extract Text & page count
        logger.info(f"Parsing file: {filename}")
        text, pages = extract_content(contents, filename)
        characters = len(text)
        
        if characters == 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No readable text could be extracted from the uploaded document."
            )
            
        # Get API key
        api_key = get_api_key()
        
        # 3. Build FAISS index from the chunks
        logger.info("Building FAISS index...")
        vector_store = build_faiss_index(text, api_key)
        
        # 4. Extract Structured Fields
        logger.info("Extracting structured candidate data...")
        extracted_data = extract_structured_data(text, api_key)
        
        # Store in app state
        app.state.vector_store = vector_store
        app.state.extracted_data = extracted_data
        app.state.raw_text = text
        app.state.has_uploaded = True
        
        logger.info(f"Successfully processed resume: {filename}. Pages: {pages}, Characters: {characters}")
        
        return UploadResponse(
            status="success",
            pages=pages,
            characters=characters,
            extracted_data=extracted_data
        )
        
    except HTTPException as he:
        raise he
    except Exception as e:
        logger.exception("Error during upload processing")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Resume processing failed: {str(e)}"
        )

@app.post("/ask", response_model=AskResponse)
async def ask_question(request: AskRequest):
    """
    Answers questions about the uploaded resume using retrieved context
    and prevents hallucinations.
    """
    question = request.question.strip()
    if not question:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="The question cannot be empty."
        )
        
    if not app.state.has_uploaded or app.state.vector_store is None:
        return AskResponse(
            answer="No resume has been uploaded yet. Please upload a resume first.",
            source="System State"
        )
        
    try:
        # Get API key
        api_key = get_api_key()
        
        # 1. Semantic Retrieval
        logger.info(f"Retrieving chunks for question: {question}")
        retrieved_chunks = retrieve_relevant_chunks(app.state.vector_store, question, k=4)
        
        if not retrieved_chunks:
            return AskResponse(
                answer="The resume does not provide that information.",
                source=""
            )
            
        context_text = "\n\n".join(retrieved_chunks)
        
        # Create the strict grounding prompt
        prompt = f"""
You are HireLens AI, an intelligent recruiter assistant. Your job is to answer questions about the candidate based ONLY on the provided context extracted from their resume.

CRITICAL RULES:
1. Answer the question using ONLY the provided resume context.
2. If the context does not contain enough information to answer the question, or if you are unsure, you MUST return EXACTLY:
   "The resume does not provide that information."
3. Do NOT make up any facts, years of experience, skills, projects, or background. Do NOT hallucinate under any circumstances.
4. The 'source' field must contain the EXACT sentence or paragraph from the context that contains the key facts used to build your answer. If no information is found, leave 'source' empty.

Context from Resume:
---
{context_text}
---

Question:
{question}

You must return your response as a valid JSON object matching this structure:
{{
    "answer": "Your grounded answer here (or 'The resume does not provide that information.')",
    "source": "The exact sentence or paragraph from the context used for this answer, or empty string."
}}

Do NOT wrap in markdown, do NOT output anything else. Output only the JSON.
"""

        groq_key = os.getenv("GROQ_API_KEY")
        content = ""
        
        # 1. Prioritize Groq (llama-3.3-70b-versatile) for sub-second chat responses if key is available
        if groq_key:
            logger.info("Attempting Q&A using Groq (llama-3.3-70b-versatile)...")
            try:
                from langchain_groq import ChatGroq
                groq_llm = ChatGroq(
                    model="llama-3.3-70b-versatile",
                    api_key=groq_key,
                    temperature=0.0
                )
                response = groq_llm.invoke(prompt)
                content = response.content.strip()
                logger.info("Groq Q&A succeeded.")
            except Exception as ge:
                logger.warning(f"Groq Q&A failed: {ge}. Falling back to Gemini...")

        # 2. Default to Gemini 2.5 Flash (or fallback if Groq failed/was not configured)
        if not content:
            llm = ChatGoogleGenerativeAI(
                model="gemini-2.5-flash",
                google_api_key=api_key,
                temperature=0.0
            )
            try:
                logger.info("Attempting Q&A using Gemini (gemini-2.5-flash)...")
                response = llm.invoke(prompt)
                content = response.content.strip()
                logger.info("Gemini Q&A succeeded.")
            except Exception as e:
                logger.error(f"Gemini Q&A failed: {e}")
                # If we tried Gemini first and it failed, and Groq wasn't tried yet, try Groq here
                if not groq_key and os.getenv("GROQ_API_KEY"):
                    groq_key = os.getenv("GROQ_API_KEY")
                    logger.info("Attempting delayed Groq fallback for Q&A...")
                    try:
                        from langchain_groq import ChatGroq
                        groq_llm = ChatGroq(
                            model="llama-3.3-70b-versatile",
                            api_key=groq_key,
                            temperature=0.0
                        )
                        response = groq_llm.invoke(prompt)
                        content = response.content.strip()
                        logger.info("Delayed Groq Q&A succeeded.")
                    except Exception as ge:
                        logger.error(f"Delayed Groq Q&A also failed: {ge}")
                        raise ge
                else:
                    raise e
        
        logger.info(f"Raw LLM Response: {content}")
        
        # Strip markdown syntax if LLM includes it
        if content.startswith("```"):
            lines = content.split("\n")
            if lines[0].startswith("```"):
                lines = lines[1:]
            if lines[-1].startswith("```"):
                lines = lines[:-1]
            content = "\n".join(lines).strip()
            
        # Parse output JSON
        try:
            result = json.loads(content)
            answer = result.get("answer", "").strip()
            source = result.get("source", "").strip()
        except json.JSONDecodeError:
            # Fallback if JSON decode fails
            logger.warning("Failed to decode JSON response from Gemini. Using raw content.")
            answer = content
            source = ""
            
        # Ensure strict compliance with the non-hallucination phrase
        # If the LLM output is not grounded or is a generic failure response, clean it up
        if "does not provide that information" in answer.lower() or "not provide that information" in answer.lower():
            answer = "The resume does not provide that information."
            source = ""
            
        return AskResponse(
            answer=answer,
            source=source
        )
        
    except Exception as e:
        logger.exception("Error during Q&A processing")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to query the resume: {str(e)}"
        )
