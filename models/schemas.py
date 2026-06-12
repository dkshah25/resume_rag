from pydantic import BaseModel, Field
from typing import List, Union, Optional

class ExtractedResumeData(BaseModel):
    skills: List[str] = Field(default_factory=list, description="List of technical and soft skills extracted from the resume.")
    experience_years: str = Field(default="Not specified", description="Total years of professional experience. Set to 'Not specified' if no work experience or dates are mentioned. Otherwise, calculate by summing job durations using June 2026 as the current date for 'Present' jobs.")
    projects: List[str] = Field(default_factory=list, description="List of projects worked on.")
    education: List[str] = Field(default_factory=list, description="List of educational qualifications (degrees, universities).")
    certifications: List[str] = Field(default_factory=list, description="List of certifications.")

class UploadResponse(BaseModel):
    status: str = Field(..., description="Status of the upload, e.g., 'success'.")
    pages: int = Field(..., description="Number of pages in the uploaded document.")
    characters: int = Field(..., description="Number of characters in the extracted text.")
    extracted_data: Optional[ExtractedResumeData] = Field(default=None, description="Additive extracted structured candidate fields.")

class AskRequest(BaseModel):
    question: str = Field(..., description="Question to ask about the candidate's resume.")

class AskResponse(BaseModel):
    answer: str = Field(..., description="Grounded answer to the question.")
    source: str = Field(..., description="The exact sentence or paragraph from the resume that contains the answer.")
