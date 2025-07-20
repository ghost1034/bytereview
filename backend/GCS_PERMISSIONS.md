# GCS Permissions for Gemini API Integration

## Overview

This document outlines the required Google Cloud Storage permissions for the ByteReview application to work with Gemini API using GCS URIs directly.

## Required IAM Roles

### For the Application Service Account

The service account used by ByteReview needs the following permissions:

1. **Storage Object Admin** (`roles/storage.objectAdmin`)

   - Allows full control over GCS objects
   - Required for uploading, downloading, and managing files

2. **Storage Bucket Reader** (`roles/storage.legacyBucketReader`)
   - Allows reading bucket metadata
   - Required for bucket operations

### For Gemini API Access

The Gemini API needs to be able to access files in your GCS bucket. This can be configured in two ways:

#### Option 1: Public Read Access (Not Recommended for Production)

- Make the bucket publicly readable
- Only suitable for development/testing

#### Option 2: Service Account Access (Recommended)

- Grant the Gemini service account access to your bucket
- More secure and suitable for production

## Required Permissions

### Minimum Required Permissions

The service account needs these specific permissions:

```json
{
  "bindings": [
    {
      "role": "roles/storage.objectAdmin",
      "members": [
        "serviceAccount:your-service-account@your-project.iam.gserviceaccount.com"
      ]
    },
    {
      "role": "roles/storage.legacyBucketReader",
      "members": [
        "serviceAccount:your-service-account@your-project.iam.gserviceaccount.com"
      ]
    }
  ]
}
```

### For Gemini API Access

Grant the Gemini service account read access to your bucket:

```json
{
  "bindings": [
    {
      "role": "roles/storage.objectViewer",
      "members": [
        "serviceAccount:service-{PROJECT_NUMBER}@gcp-sa-aiplatform.iam.gserviceaccount.com"
      ]
    }
  ]
}
```

## Configuration Steps

### 1. Set up Service Account

1. Create a service account in Google Cloud Console
2. Download the service account key JSON file
3. Place it in your backend directory as `service-account.json`
4. Set the environment variable: `GOOGLE_APPLICATION_CREDENTIALS=service-account.json`

### 2. Configure GCS Bucket

1. Create a GCS bucket for your application
2. Set the bucket name in your environment: `GCS_BUCKET_NAME=your-bucket-name`
3. Configure bucket permissions as described above

### 3. Grant Gemini API Access

Run the following gcloud command to grant Gemini access to your bucket:

```bash
# Replace PROJECT_ID and BUCKET_NAME with your values
gsutil iam ch serviceAccount:service-$(gcloud projects describe PROJECT_ID --format="value(projectNumber)")@gcp-sa-aiplatform.iam.gserviceaccount.com:objectViewer gs://BUCKET_NAME
```

### 4. Test Configuration

Run the test script to verify everything is working:

```bash
python backend/test_gcs_uri.py
```

## Troubleshooting

### Common Issues

1. **403 Forbidden Error**

   - Check that the service account has the required permissions
   - Verify that Gemini API has access to the bucket

2. **404 Not Found Error**

   - Verify the bucket name is correct
   - Check that the file exists in GCS
   - Ensure the GCS URI is properly formatted

3. **Authentication Error**
   - Verify the service account key file is in the correct location
   - Check that GOOGLE_APPLICATION_CREDENTIALS is set correctly

### Verification Commands

```bash
# Check service account permissions
gcloud projects get-iam-policy YOUR_PROJECT_ID

# Check bucket permissions
gsutil iam get gs://YOUR_BUCKET_NAME

# Test file access
gsutil ls gs://YOUR_BUCKET_NAME/
```

## Security Best Practices

1. **Principle of Least Privilege**

   - Only grant the minimum required permissions
   - Use separate service accounts for different functions

2. **Bucket Security**

   - Don't make buckets publicly readable unless necessary
   - Use IAM conditions to restrict access further if needed

3. **Key Management**

   - Rotate service account keys regularly
   - Store keys securely and never commit them to version control

4. **Monitoring**
   - Enable audit logging for GCS operations
   - Monitor for unusual access patterns
