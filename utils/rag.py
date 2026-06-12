import os
import logging
from typing import List
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_google_genai import GoogleGenerativeAIEmbeddings
from langchain_community.vectorstores import FAISS

logger = logging.getLogger("hirelens.rag")

def get_embeddings_model(api_key: str) -> GoogleGenerativeAIEmbeddings:
    """
    Initializes and returns the Google GenAI Embeddings instance.
    """
    # Ensure environment variables are set so LangChain can pick it up
    os.environ["GOOGLE_API_KEY"] = api_key
    os.environ["GEMINI_API_KEY"] = api_key
    
    return GoogleGenerativeAIEmbeddings(
        model="models/gemini-embedding-001",
        google_api_key=api_key
    )

def build_faiss_index(text: str, api_key: str) -> FAISS:
    """
    Splits the input text into chunks, generates embeddings using Gemini,
    and returns a FAISS vector store.
    """
    try:
        # 1. Chunking: Recursive character splitting
        # Use chunk size of 500 characters and overlap of 50
        text_splitter = RecursiveCharacterTextSplitter(
            chunk_size=1000,
            chunk_overlap=100,
            length_function=len
        )
        chunks = text_splitter.create_documents([text])
        logger.info(f"Split resume text into {len(chunks)} chunks.")
        
        if not chunks:
            raise ValueError("No text could be extracted or chunked from the document.")

        # 2. Embedding Generation & FAISS Index Build
        embeddings = get_embeddings_model(api_key)
        vector_store = FAISS.from_documents(chunks, embeddings)
        logger.info("Successfully created FAISS vector store.")
        return vector_store
    except Exception as e:
        logger.error(f"Failed to build FAISS index: {e}")
        raise RuntimeError(f"Failed to generate search index: {str(e)}")

def retrieve_relevant_chunks(vector_store: FAISS, query: str, k: int = 4) -> List[str]:
    """
    Performs similarity search on the FAISS vector store and returns top k chunks.
    """
    try:
        docs = vector_store.similarity_search(query, k=k)
        retrieved_content = [doc.page_content for doc in docs]
        logger.info(f"Retrieved {len(retrieved_content)} chunks for query '{query}'.")
        return retrieved_content
    except Exception as e:
        logger.error(f"Vector search failure: {e}")
        raise RuntimeError(f"Vector search search failed: {str(e)}")
