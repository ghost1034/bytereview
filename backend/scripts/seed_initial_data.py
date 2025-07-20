#!/usr/bin/env python3
"""
Seed initial data for ByteReview database
Populates system_prompts and data_types tables with default values
"""
import os
import sys
from pathlib import Path

# Add backend directory to path
backend_dir = Path(__file__).parent.parent
sys.path.insert(0, str(backend_dir))

from dotenv import load_dotenv
load_dotenv()

from core.database import db_config
from models.db_models import SystemPrompt, DataType

def seed_system_prompts():
    """Seed the system_prompts table with default prompts"""
    db = db_config.get_session()
    
    try:
        # Check if we already have system prompts
        existing_prompts = db.query(SystemPrompt).count()
        if existing_prompts > 0:
            print(f"System prompts already exist ({existing_prompts} found), skipping...")
            return
        
        # Create default system prompt
        default_prompt = SystemPrompt(
            name="default_extraction_v1",
            template_text="""You are an expert document analysis AI specialized in extracting structured data from PDF documents. 

Your task is to carefully analyze the provided document and extract the requested information with high accuracy. Follow these guidelines:

1. Extract information exactly as it appears in the document
2. If information is not found or unclear, use null
3. For dates, use the format specified in the field requirements
4. For numbers, extract only the numeric value without currency symbols or formatting
5. Be precise and consistent in your extractions
6. Focus on the most relevant and clear instances of the requested data""",
            version=1,
            is_active=True
        )
        
        db.add(default_prompt)
        db.commit()
        print("✅ Created default system prompt: default_extraction_v1")
        
    except Exception as e:
        print(f"❌ Error seeding system prompts: {e}")
        db.rollback()
    finally:
        db.close()

def seed_data_types():
    """Seed the data_types table with common data types"""
    db = db_config.get_session()
    
    try:
        # Check if we already have data types
        existing_types = db.query(DataType).count()
        if existing_types > 0:
            print(f"Data types already exist ({existing_types} found), skipping...")
            return
        
        # Define common data types
        data_types = [
            # Text types
            {
                "id": "text",
                "display_name": "Text",
                "base_json_type": "string",
                "json_format": None,
                "description": "General text field",
                "display_order": 1
            },
            {
                "id": "email",
                "display_name": "Email",
                "base_json_type": "string",
                "json_format": "email",
                "description": "Email address",
                "display_order": 2
            },
            {
                "id": "phone",
                "display_name": "Phone Number",
                "base_json_type": "string",
                "json_format": None,
                "description": "Phone number",
                "display_order": 3
            },
            {
                "id": "address",
                "display_name": "Address",
                "base_json_type": "string",
                "json_format": None,
                "description": "Physical address",
                "display_order": 4
            },
            {
                "id": "name",
                "display_name": "Name",
                "base_json_type": "string",
                "json_format": None,
                "description": "Person or company name",
                "display_order": 5
            },
            {
                "id": "url",
                "display_name": "URL",
                "base_json_type": "string",
                "json_format": "uri",
                "description": "Web URL",
                "display_order": 6
            },
            
            # Number types
            {
                "id": "number",
                "display_name": "Number",
                "base_json_type": "number",
                "json_format": None,
                "description": "General numeric value",
                "display_order": 10
            },
            {
                "id": "currency",
                "display_name": "Currency",
                "base_json_type": "number",
                "json_format": None,
                "description": "Monetary amount (numeric value only)",
                "display_order": 11
            },
            {
                "id": "percentage",
                "display_name": "Percentage",
                "base_json_type": "number",
                "json_format": None,
                "description": "Percentage value",
                "display_order": 12
            },
            {
                "id": "integer",
                "display_name": "Integer",
                "base_json_type": "integer",
                "json_format": None,
                "description": "Whole number",
                "display_order": 13
            },
            
            # Date types
            {
                "id": "date_mdy",
                "display_name": "Date (MM/DD/YYYY)",
                "base_json_type": "string",
                "json_format": "date",
                "description": "Date in MM/DD/YYYY format",
                "display_order": 20
            },
            {
                "id": "date_dmy",
                "display_name": "Date (DD/MM/YYYY)",
                "base_json_type": "string",
                "json_format": "date",
                "description": "Date in DD/MM/YYYY format",
                "display_order": 21
            },
            {
                "id": "date_ymd",
                "display_name": "Date (YYYY-MM-DD)",
                "base_json_type": "string",
                "json_format": "date",
                "description": "Date in YYYY-MM-DD format",
                "display_order": 22
            },
            
            # Time type
            {
                "id": "time",
                "display_name": "Time (HH:MM)",
                "base_json_type": "string",
                "json_format": "time",
                "description": "Time in HH:MM format",
                "display_order": 30
            },
            
            # Boolean type
            {
                "id": "boolean",
                "display_name": "Boolean (Yes/No)",
                "base_json_type": "boolean",
                "json_format": None,
                "description": "True/false or yes/no value",
                "display_order": 40
            }
        ]
        
        # Create DataType objects
        for dt_data in data_types:
            data_type = DataType(**dt_data)
            db.add(data_type)
        
        db.commit()
        print(f"✅ Created {len(data_types)} data types")
        
    except Exception as e:
        print(f"❌ Error seeding data types: {e}")
        db.rollback()
    finally:
        db.close()

def main():
    """Main function to seed all initial data"""
    print("🌱 Seeding initial data for ByteReview...")
    
    # Seed system prompts
    seed_system_prompts()
    
    # Seed data types
    seed_data_types()
    
    print("✅ Initial data seeding completed!")

if __name__ == "__main__":
    main()