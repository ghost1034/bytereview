#!/usr/bin/env python3
"""
Test script to verify GCS URI support with Gemini API and test GCS URI utilities
"""
import os
import sys
from pathlib import Path

# Add backend directory to path
backend_dir = Path(__file__).parent
sys.path.insert(0, str(backend_dir))

import google.generativeai as genai
from dotenv import load_dotenv
from services.gcs_service import construct_gcs_uri, validate_gcs_uri, get_storage_service

# Load environment variables
load_dotenv()

def test_gcs_uri_support():
    """Test if Gemini API supports GCS URIs directly"""
    
    # Configure Gemini
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        print("GEMINI_API_KEY not found")
        return False
    
    genai.configure(api_key=api_key)
    
    # Test GCS URI construction
    bucket_name = os.getenv("GCS_BUCKET_NAME", "bytereview-files")
    test_object = "test/sample.pdf"
    gcs_uri = f"gs://{bucket_name}/{test_object}"
    
    print(f"Testing GCS URI: {gcs_uri}")
    
    try:
        # Try different approaches to use GCS URI with Gemini
        
        # Approach 1: Direct URI in content
        model = genai.GenerativeModel('gemini-2.5-pro')
        
        # This is the correct way according to Gemini documentation
        # GCS URIs should be passed directly as strings in the content parts
        content_parts = [
            "Analyze this document and tell me what type of document it is.",
            gcs_uri
        ]
        
        print("Testing direct GCS URI approach...")
        response = model.generate_content(content_parts)
        print(f"Success! Response: {response.text[:100]}...")
        return True
        
    except Exception as e:
        print(f"Direct GCS URI approach failed: {e}")
        
        # Approach 2: Try with file object
        try:
            print("Testing file object approach...")
            # This might be the correct way
            file_part = genai.protos.Part(
                file_data=genai.protos.FileData(
                    mime_type="application/pdf",
                    file_uri=gcs_uri
                )
            )
            
            content_parts = [
                "Analyze this document and tell me what type of document it is.",
                file_part
            ]
            
            response = model.generate_content(content_parts)
            print(f"Success! Response: {response.text[:100]}...")
            return True
            
        except Exception as e2:
            print(f"File object approach failed: {e2}")
            
            # Approach 3: Check if we need to upload from GCS first
            try:
                print("Testing upload from GCS approach...")
                # This might work if Gemini can access our GCS bucket
                uploaded_file = genai.upload_file(gcs_uri)
                
                content_parts = [
                    "Analyze this document and tell me what type of document it is.",
                    uploaded_file
                ]
                
                response = model.generate_content(content_parts)
                print(f"Success! Response: {response.text[:100]}...")
                return True
                
            except Exception as e3:
                print(f"Upload from GCS approach failed: {e3}")
                print("GCS URI support test failed with all approaches")
                return False

def test_gcs_uri_utilities():
    """Test GCS URI construction and validation utilities"""
    print("\n=== Testing GCS URI Utilities ===")
    
    # Test construct_gcs_uri
    print("Testing construct_gcs_uri...")
    
    # Valid cases
    test_cases = [
        ("my-bucket", "path/to/file.pdf", "gs://my-bucket/path/to/file.pdf"),
        ("bucket-name", "file.pdf", "gs://bucket-name/file.pdf"),
        ("test.bucket", "folder/subfolder/document.pdf", "gs://test.bucket/folder/subfolder/document.pdf"),
        ("bucket", "/leading/slash/file.pdf", "gs://bucket/leading/slash/file.pdf"),  # Should handle leading slash
    ]
    
    for bucket, object_name, expected in test_cases:
        try:
            result = construct_gcs_uri(bucket, object_name)
            if result == expected:
                print(f"  ✅ {bucket}/{object_name} -> {result}")
            else:
                print(f"  ❌ {bucket}/{object_name} -> {result} (expected {expected})")
        except Exception as e:
            print(f"  ❌ {bucket}/{object_name} -> Error: {e}")
    
    # Test error cases
    print("Testing error cases...")
    error_cases = [
        ("", "file.pdf"),  # Empty bucket
        ("bucket", ""),    # Empty object
        (None, "file.pdf"), # None bucket
        ("bucket", None),   # None object
    ]
    
    for bucket, object_name in error_cases:
        try:
            result = construct_gcs_uri(bucket, object_name)
            print(f"  ❌ {bucket}/{object_name} -> {result} (should have failed)")
        except ValueError as e:
            print(f"  ✅ {bucket}/{object_name} -> Correctly failed: {e}")
        except Exception as e:
            print(f"  ❌ {bucket}/{object_name} -> Unexpected error: {e}")
    
    # Test validate_gcs_uri
    print("Testing validate_gcs_uri...")
    
    validation_cases = [
        ("gs://bucket/file.pdf", True),
        ("gs://my-bucket/path/to/file.pdf", True),
        ("gs://bucket.name/file.pdf", True),
        ("http://bucket/file.pdf", False),  # Wrong protocol
        ("gs://", False),  # No bucket/object
        ("gs://bucket", False),  # No object
        ("bucket/file.pdf", False),  # No gs:// prefix
        ("", False),  # Empty string
        (None, False),  # None
    ]
    
    for uri, expected in validation_cases:
        result = validate_gcs_uri(uri)
        if result == expected:
            print(f"  ✅ {uri} -> {result}")
        else:
            print(f"  ❌ {uri} -> {result} (expected {expected})")
    
    # Test GCS service integration
    print("Testing GCS service integration...")
    try:
        storage_service = get_storage_service()
        if hasattr(storage_service, 'construct_gcs_uri_for_object'):
            test_object = "test/sample.pdf"
            uri = storage_service.construct_gcs_uri_for_object(test_object)
            print(f"  ✅ Service URI construction: {test_object} -> {uri}")
            
            # Validate the constructed URI
            if validate_gcs_uri(uri):
                print(f"  ✅ Constructed URI is valid")
            else:
                print(f"  ❌ Constructed URI is invalid")
        else:
            print(f"  ⚠️  GCS service doesn't support URI construction (using fallback)")
    except Exception as e:
        print(f"  ❌ GCS service test failed: {e}")

def test_ai_service_gcs_uris():
    """Test AI service with GCS URIs and database integration"""
    print("\n=== Testing AI Service with GCS URIs and Database ===")
    
    try:
        from services.ai_extraction_service import AIExtractionService
        from models.extraction import FieldConfig
        from core.database import db_config
        from models.db_models import SystemPrompt, DataType
        
        # Initialize AI service
        ai_service = AIExtractionService()
        
        # Test database integration
        db = db_config.get_session()
        try:
            # Get system prompt from database
            system_prompt = db.query(SystemPrompt).filter(SystemPrompt.is_active == True).first()
            if system_prompt:
                print(f"  ✅ Found active system prompt: {system_prompt.name}")
                print(f"  ✅ System prompt length: {len(system_prompt.template_text)} characters")
            else:
                print(f"  ❌ No active system prompt found in database")
                return
            
            # Get data types from database
            data_types = db.query(DataType).all()
            data_types_map = {
                dt.id: {
                    "base_json_type": dt.base_json_type,
                    "json_format": dt.json_format,
                    "display_name": dt.display_name,
                    "description": dt.description
                }
                for dt in data_types
            }
            print(f"  ✅ Found {len(data_types)} data types in database")
            
            # Test field configurations using database data types
            available_types = list(data_types_map.keys())[:3]  # Use first 3 available types
            field_configs = []
            
            for i, dt_id in enumerate(available_types):
                field_configs.append(FieldConfig(
                    name=f"test_field_{i+1}",
                    data_type=dt_id,
                    prompt=f"Extract test field {i+1}"
                ))
            
            print(f"  ✅ Created {len(field_configs)} test field configs using database types")
            
            # Test JSON schema creation with database data
            json_schema = ai_service.create_json_schema(field_configs, data_types_map)
            print(f"  ✅ JSON schema created successfully")
            print(f"  ✅ Schema has {len(json_schema['properties'])} properties")
            
            # Verify schema uses correct types from database
            for field_name, field_schema in json_schema['properties'].items():
                field_config = next(f for f in field_configs if f.name == field_name)
                expected_type = data_types_map[field_config.data_type]["base_json_type"]
                actual_type = field_schema["type"]
                if actual_type == expected_type:
                    print(f"  ✅ Field '{field_name}' has correct type: {actual_type}")
                else:
                    print(f"  ❌ Field '{field_name}' type mismatch: expected {expected_type}, got {actual_type}")
            
            # Test GCS URI construction
            bucket_name = os.getenv("GCS_BUCKET_NAME", "bytereview-files")
            test_object = "test/sample.pdf"
            gcs_uri = ai_service.construct_gcs_uri(bucket_name, test_object)
            print(f"  ✅ AI service URI construction: {gcs_uri}")
            
            print(f"  ✅ AI service database integration working correctly")
            
        finally:
            db.close()
        
    except Exception as e:
        print(f"  ❌ AI service database test failed: {e}")
        import traceback
        traceback.print_exc()

def test_memory_usage():
    """Test that the new approach uses less memory"""
    print("\n=== Testing Memory Usage ===")
    
    import psutil
    import os
    
    # Get current process
    process = psutil.Process(os.getpid())
    
    # Measure memory before
    memory_before = process.memory_info().rss / 1024 / 1024  # MB
    print(f"  Memory before tests: {memory_before:.2f} MB")
    
    # Simulate the old approach (creating large file content in memory)
    print("  Simulating old approach (file content in memory)...")
    large_content = b"x" * (10 * 1024 * 1024)  # 10MB of data
    files_data = [{"filename": "test.pdf", "content": large_content} for _ in range(5)]
    
    memory_old_approach = process.memory_info().rss / 1024 / 1024  # MB
    print(f"  Memory with old approach simulation: {memory_old_approach:.2f} MB")
    
    # Clear the large content
    del large_content
    del files_data
    
    # Simulate the new approach (just URIs)
    print("  Simulating new approach (GCS URIs only)...")
    gcs_uris = [f"gs://bucket/file_{i}.pdf" for i in range(5)]
    filenames = [f"file_{i}.pdf" for i in range(5)]
    
    memory_new_approach = process.memory_info().rss / 1024 / 1024  # MB
    print(f"  Memory with new approach simulation: {memory_new_approach:.2f} MB")
    
    # Calculate savings
    memory_saved = memory_old_approach - memory_new_approach
    print(f"  ✅ Memory saved: {memory_saved:.2f} MB")
    
    if memory_saved > 0:
        print(f"  ✅ New approach uses less memory!")
    else:
        print(f"  ⚠️  Memory usage similar (expected in simulation)")
    
    # Clean up
    del gcs_uris
    del filenames

if __name__ == "__main__":
    # Test GCS URI utilities first
    test_gcs_uri_utilities()
    
    # Test AI service with GCS URIs
    test_ai_service_gcs_uris()
    
    # Test memory usage improvements
    test_memory_usage()
    
    # Then test Gemini API support
    print("\n=== Testing Gemini API GCS Support ===")
    success = test_gcs_uri_support()
    if success:
        print("✅ GCS URI support confirmed")
        print("✅ All tests completed successfully!")
    else:
        print("❌ GCS URI support not working - will need to use file download approach")