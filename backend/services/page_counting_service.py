"""
Service for counting pages in uploaded files
"""
import os
import tempfile
import logging
from typing import Optional
import PyPDF2
import fitz  # PyMuPDF - fallback for complex PDFs

logger = logging.getLogger(__name__)

class PageCountingService:
    """Service for counting pages in various file types"""
    
    @staticmethod
    def count_pages_from_content(file_content: bytes, filename: str) -> Optional[int]:
        """
        Count pages in a file from its content
        
        Args:
            file_content: Raw file content as bytes
            filename: Original filename for type detection
            
        Returns:
            Number of pages, or None if unable to count
        """
        try:
            # Determine file type from extension
            file_ext = os.path.splitext(filename)[1].lower()
            
            if file_ext == '.pdf':
                return PageCountingService._count_pdf_pages(file_content)
            else:
                # For non-PDF files, assume 1 page
                logger.info(f"Non-PDF file {filename}, assuming 1 page")
                return 1
                
        except Exception as e:
            logger.error(f"Error counting pages for {filename}: {e}")
            return None
    
    @staticmethod
    def _count_pdf_pages(pdf_content: bytes) -> Optional[int]:
        """
        Count pages in a PDF file using multiple methods
        
        Args:
            pdf_content: PDF file content as bytes
            
        Returns:
            Number of pages, or None if unable to count
        """
        # Method 1: Try PyPDF2 first (faster)
        try:
            import io
            pdf_reader = PyPDF2.PdfReader(io.BytesIO(pdf_content))
            page_count = len(pdf_reader.pages)
            logger.debug(f"PyPDF2 counted {page_count} pages")
            return page_count
        except Exception as e:
            logger.warning(f"PyPDF2 failed to count pages: {e}")
        
        # Method 2: Try PyMuPDF as fallback (more robust)
        try:
            import io
            pdf_doc = fitz.open(stream=pdf_content, filetype="pdf")
            page_count = pdf_doc.page_count
            pdf_doc.close()
            logger.debug(f"PyMuPDF counted {page_count} pages")
            return page_count
        except Exception as e:
            logger.warning(f"PyMuPDF failed to count pages: {e}")
        
        # Method 3: Try with temporary file (last resort)
        try:
            with tempfile.NamedTemporaryFile(suffix='.pdf', delete=False) as temp_file:
                temp_file.write(pdf_content)
                temp_file.flush()
                
                try:
                    pdf_doc = fitz.open(temp_file.name)
                    page_count = pdf_doc.page_count
                    pdf_doc.close()
                    logger.debug(f"PyMuPDF (temp file) counted {page_count} pages")
                    return page_count
                finally:
                    os.unlink(temp_file.name)
                    
        except Exception as e:
            logger.error(f"All PDF page counting methods failed: {e}")
        
        return None

# Global instance
page_counting_service = PageCountingService()