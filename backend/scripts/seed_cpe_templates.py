#!/usr/bin/env python3
"""
Seed CPE state templates for the CPE Tracker feature
Creates public templates with template_type='cpe' for each supported state
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
from models.db_models import Template, TemplateField

# California CPE template fields
# Based on California Board of Accountancy CPE requirements
CALIFORNIA_CPE_FIELDS = [
    {
        "field_name": "Course Title",
        "data_type_id": "text",
        "ai_prompt": "Extract the title or name of the CPE course, program, or learning activity.",
        "display_order": 1
    },
    {
        "field_name": "Provider/Sponsor",
        "data_type_id": "text",
        "ai_prompt": "Extract the name of the organization, company, or institution that provided or sponsored the CPE course.",
        "display_order": 2
    },
    {
        "field_name": "Completion Date",
        "data_type_id": "date_mdy",
        "ai_prompt": "Extract the date the course was completed. If a date range is shown, use the end date.",
        "display_order": 3
    },
    {
        "field_name": "CPE Hours",
        "data_type_id": "number",
        "ai_prompt": "Extract the number of CPE credit hours earned. This may be labeled as CPE hours, credits, CE hours, or similar. Extract only the numeric value.",
        "display_order": 4
    },
    {
        "field_name": "Field of Study",
        "data_type_id": "text",
        "ai_prompt": "Extract the subject area, field of study, or category of the CPE course (e.g., Accounting, Auditing, Ethics, Taxation, Business Law, etc.).",
        "display_order": 5
    },
    {
        "field_name": "Certificate Number",
        "data_type_id": "text",
        "ai_prompt": "Extract any certificate number, confirmation number, or completion ID if present on the document.",
        "display_order": 6
    },
    {
        "field_name": "Delivery Method",
        "data_type_id": "text",
        "ai_prompt": "Extract the delivery method or format of the course (e.g., Self-Study, Group Live, Webinar, Online, Nano Learning, etc.) if indicated.",
        "display_order": 7
    },
]


def seed_california_cpe_template():
    """Seed the California CPE template"""
    db = db_config.get_session()

    try:
        # Check if California CPE template already exists
        existing = db.query(Template).filter(
            Template.name == "California",
            Template.template_type == "cpe"
        ).first()

        if existing:
            print(f"California CPE template already exists (id={existing.id}), updating fields...")
            # Delete existing fields and recreate
            db.query(TemplateField).filter(TemplateField.template_id == existing.id).delete()
            template = existing
        else:
            # Create new template
            template = Template(
                user_id=None,  # Public template
                name="California",
                description="CPE tracking template for California Board of Accountancy requirements",
                is_public=True,
                template_type="cpe"
            )
            db.add(template)
            db.flush()  # Get the template ID
            print(f"Created California CPE template (id={template.id})")

        # Create template fields
        for field_data in CALIFORNIA_CPE_FIELDS:
            field = TemplateField(
                template_id=template.id,
                **field_data
            )
            db.add(field)

        db.commit()
        print(f"✅ California CPE template seeded with {len(CALIFORNIA_CPE_FIELDS)} fields")

    except Exception as e:
        print(f"❌ Error seeding California CPE template: {e}")
        db.rollback()
        raise
    finally:
        db.close()


def main():
    """Main function to seed CPE templates"""
    print("🌱 Seeding CPE templates...")

    # Seed California template
    seed_california_cpe_template()

    # Future: Add other state templates here
    # seed_texas_cpe_template()
    # seed_new_york_cpe_template()
    # etc.

    print("✅ CPE template seeding completed!")


if __name__ == "__main__":
    main()
