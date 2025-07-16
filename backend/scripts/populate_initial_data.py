"""
Script to populate initial data for data_types and system_prompts tables
This should be run after the initial migration
"""
import sys
import os
from pathlib import Path

# Add the parent directory to the path so we can import our models
sys.path.append(str(Path(__file__).parent.parent))

from sqlalchemy.orm import Session
from core.database import db_config
from models.db_models import DataType, SystemPrompt

def populate_data_types(db: Session):
    """Populate the data_types table with supported types"""
    data_types = [
        # Text types
        {"id": "text", "display_name": "Text", "base_json_type": "string", "description": "General text field", "display_order": 1},
        {"id": "email", "display_name": "Email", "base_json_type": "string", "json_format": "email", "description": "Email address", "display_order": 2},
        {"id": "phone", "display_name": "Phone Number", "base_json_type": "string", "description": "Phone number", "display_order": 3},
        {"id": "address", "display_name": "Address", "base_json_type": "string", "description": "Physical address", "display_order": 4},
        {"id": "name", "display_name": "Name", "base_json_type": "string", "description": "Person or entity name", "display_order": 5},
        {"id": "invoice_number", "display_name": "Invoice Number", "base_json_type": "string", "description": "Invoice or reference number", "display_order": 6},
        {"id": "tax_id", "display_name": "Tax ID", "base_json_type": "string", "description": "Tax identification number", "display_order": 7},
        {"id": "sku", "display_name": "SKU/Product Code", "base_json_type": "string", "description": "Product SKU or code", "display_order": 8},
        {"id": "url", "display_name": "URL", "base_json_type": "string", "json_format": "uri", "description": "Web URL", "display_order": 9},
        
        # Number types
        {"id": "number", "display_name": "Number", "base_json_type": "number", "description": "Numeric value", "display_order": 10},
        {"id": "currency", "display_name": "Currency", "base_json_type": "number", "description": "Monetary amount", "display_order": 11},
        {"id": "percentage", "display_name": "Percentage", "base_json_type": "number", "description": "Percentage value", "display_order": 12},
        {"id": "decimal", "display_name": "Decimal (2 places)", "base_json_type": "number", "description": "Decimal number", "display_order": 13},
        {"id": "integer", "display_name": "Integer", "base_json_type": "integer", "description": "Whole number", "display_order": 14},
        
        # Date types
        {"id": "date_mdy", "display_name": "Date (MM/DD/YYYY)", "base_json_type": "string", "json_format": "date", "description": "Date in MM/DD/YYYY format", "display_order": 15},
        {"id": "date_dmy", "display_name": "Date (DD/MM/YYYY)", "base_json_type": "string", "json_format": "date", "description": "Date in DD/MM/YYYY format", "display_order": 16},
        {"id": "date_ymd", "display_name": "Date (YYYY-MM-DD)", "base_json_type": "string", "json_format": "date", "description": "Date in YYYY-MM-DD format", "display_order": 17},
        {"id": "datetime", "display_name": "Date and Time", "base_json_type": "string", "json_format": "date-time", "description": "Date and time", "display_order": 18},
        
        # Boolean type
        {"id": "boolean", "display_name": "Boolean (Yes/No)", "base_json_type": "boolean", "description": "True/false value", "display_order": 19},
        
        # Array type
        {"id": "array", "display_name": "List/Array", "base_json_type": "array", "description": "List of items", "display_order": 20},
    ]
    
    for data_type_data in data_types:
        # Check if already exists
        existing = db.query(DataType).filter(DataType.id == data_type_data["id"]).first()
        if not existing:
            data_type = DataType(**data_type_data)
            db.add(data_type)
    
    db.commit()
    print(f"Populated {len(data_types)} data types")

def populate_system_prompts(db: Session):
    """Populate the system_prompts table with default prompt"""
    default_prompt = """You are an expert data extraction assistant. Your task is to extract structured information from PDF documents with high accuracy.

Instructions:
1. Carefully analyze the provided document(s)
2. Extract the requested fields exactly as specified
3. If a field cannot be found, return null for that field
4. For numeric fields, extract only the number without currency symbols or units
5. For dates, format them according to the specified format
6. For boolean fields, interpret yes/no, true/false, checked/unchecked appropriately
7. Be precise and consistent in your extractions

Return the extracted data in the exact JSON format specified by the schema."""

    # Check if active prompt already exists
    existing_active = db.query(SystemPrompt).filter(SystemPrompt.is_active == True).first()
    
    if not existing_active:
        system_prompt = SystemPrompt(
            name="default_extraction_v1",
            template_text=default_prompt,
            version=1,
            is_active=True
        )
        db.add(system_prompt)
        db.commit()
        print("Created default system prompt")
    else:
        print("Active system prompt already exists")

def main():
    """Main function to populate initial data"""
    try:
        db = db_config.get_session()
        
        print("Populating data types...")
        populate_data_types(db)
        
        print("Populating system prompts...")
        populate_system_prompts(db)
        
        print("Initial data population completed successfully!")
        
    except Exception as e:
        print(f"Error populating initial data: {e}")
        raise
    finally:
        db.close()

if __name__ == "__main__":
    main()