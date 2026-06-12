import os
import json
import logging
from langchain_google_genai import ChatGoogleGenerativeAI
from models.schemas import ExtractedResumeData

logger = logging.getLogger("hirelens.extractor")

def parse_json_content(content: str) -> ExtractedResumeData:
    """
    Utility to parse raw string response containing JSON into ExtractedResumeData.
    """
    content = content.strip()
    # Strip code block markdown if present
    if content.startswith("```"):
        lines = content.split("\n")
        if lines[0].startswith("```"):
            lines = lines[1:]
        if lines[-1].startswith("```"):
            lines = lines[:-1]
        content = "\n".join(lines).strip()
        
    data = json.loads(content)
    return ExtractedResumeData(
        skills=data.get("skills", []),
        experience_years=data.get("experience_years", "0"),
        projects=data.get("projects", []),
        education=data.get("education", []),
        certifications=data.get("certifications", [])
    )

def extract_structured_data(text: str, api_key: str) -> ExtractedResumeData:
    """
    Extracts structured fields (Skills, Experience, Projects, Education, Certifications)
    from the resume text. Prioritizes Groq llama-3.3-70b-versatile for sub-second speeds,
    falling back to Gemini 2.5 Flash if needed.
    """
    fallback_prompt = f"""
You are an expert resume parser. Extract the structured details from the candidate's resume text provided below.

Provide the response in raw JSON format matching this schema:
{{
    "skills": ["List of skills, technologies, tools, and languages"],
    "experience_years": "Total years of professional experience as a string (e.g., '5 years', '5.5 years'). IMPORTANT: Sum all non-overlapping job durations using June 2026 as the current date for 'Present' roles. If the candidate has no professional work experience listed or no job dates are mentioned, set this field to EXACTLY 'Not specified'. Do NOT guess, assume, or return a number if no experience is listed.",
    "projects": ["List of projects, tasks, or achievements"],
    "education": ["Degrees, certifications, diplomas, schools, and graduation dates"],
    "certifications": ["Professional credentials, licenses, or course completions"]
}}

Do NOT include any markdown formatting (like ```json), no trailing commas, and no explanations. Return ONLY the JSON object.

Resume text:
{text}
"""

    groq_key = os.getenv("GROQ_API_KEY")

    # 1. Groq (Prioritized for instant parsing if key is available)
    if groq_key:
        logger.info("Attempting structured extraction using Groq (llama-3.3-70b-versatile)...")
        try:
            from langchain_groq import ChatGroq
            groq_llm = ChatGroq(
                model="llama-3.3-70b-versatile",
                api_key=groq_key,
                temperature=0.0
            )
            response = groq_llm.invoke(fallback_prompt)
            extracted = parse_json_content(response.content)
            logger.info("Groq structured extraction succeeded.")
            return extracted
        except Exception as ge:
            logger.error(f"Groq structured extraction failed: {ge}. Falling back to Gemini...")

    # 2. Gemini 2.5 Flash (Default/Fallback)
    try:
        os.environ["GOOGLE_API_KEY"] = api_key
        os.environ["GEMINI_API_KEY"] = api_key
        
        llm = ChatGoogleGenerativeAI(
            model="gemini-2.5-flash",
            google_api_key=api_key,
            temperature=0.0
        )
        
        # Try structured extraction
        try:
            logger.info("Attempting Gemini structured extraction with with_structured_output...")
            structured_llm = llm.with_structured_output(ExtractedResumeData)
            extracted = structured_llm.invoke(
                f"Analyze the following resume text and extract all details. For experience_years, sum all non-overlapping professional job durations (using June 2026 as current date for 'Present' roles) or use explicitly stated total if provided. If no work experience or job dates are mentioned, set experience_years to exactly 'Not specified'. Resume text:\n\n{text}"
            )
            if extracted and isinstance(extracted, ExtractedResumeData):
                logger.info("Gemini structured extraction succeeded.")
                return extracted
        except Exception as e:
            logger.warning(f"Gemini with_structured_output failed: {e}. Trying Gemini manual JSON prompt...")
            
        # Try manual JSON prompt
        response = llm.invoke(fallback_prompt)
        extracted = parse_json_content(response.content)
        logger.info("Gemini manual JSON parsing succeeded.")
        return extracted
        
    except Exception as e:
        logger.error(f"Gemini extraction failed: {e}")
        # If Groq wasn't tried yet (e.g. if key was loaded late or there was another path issue), try it here
        if not groq_key and os.getenv("GROQ_API_KEY"):
            groq_key = os.getenv("GROQ_API_KEY")
            logger.info("Attempting delayed Groq fallback for structured extraction...")
            try:
                from langchain_groq import ChatGroq
                groq_llm = ChatGroq(
                    model="llama-3.3-70b-versatile",
                    api_key=groq_key,
                    temperature=0.0
                )
                response = groq_llm.invoke(fallback_prompt)
                extracted = parse_json_content(response.content)
                logger.info("Delayed Groq structured extraction succeeded.")
                return extracted
            except Exception as ge:
                logger.error(f"Delayed Groq structured extraction failed: {ge}")
                
        # Return a safe empty schema rather than crashing
        return ExtractedResumeData(
            skills=[],
            experience_years="Not specified",
            projects=[],
            education=[],
            certifications=[]
        )
