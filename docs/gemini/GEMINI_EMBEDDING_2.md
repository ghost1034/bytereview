# Gemini Embedding 2

Preview

This product or feature is subject to the "Pre-GA Offerings Terms" in the General Service Terms section of the Service Specific Terms, and the Additional Terms for Generative AI Preview Products. You can process personal data for this product or feature as outlined in the Cloud Data Processing Addendum, subject to the obligations and restrictions described in the agreement under which you access Google Cloud. Pre-GA products and features are available "as is" and might have limited support. For more information, see the launch stage descriptions.

Gemini Embedding 2 is Google's embedding generation model that's ideal for complex retrieval and analytics tasks.

Gemini Embedding 2 accepts multimodal inputs to generate 3072-dimensional vectors. It accepts images, text, documents, audio, and video inputs and semantically maps the generated vectors into a unified semantic space. This lets you perform tasks, such as searching for an image based on a text description.

Gemini Embedding 2 introduces several features to optimize embedding quality and flexibility:

    Custom task instructions: By specifying task instructions—for example, task:code retrieval or task:search result—optimize the embeddings for the intended relationships and retrieve more accurate results for the specific goal.

    Adjustable result size: The model generates a 3072-dimensional float vector, by default. However, you can retrieve a smaller dimensional output by specifying the output_dimensionality parameter.

    Document OCR: Read OCR from document inputs.

    Audio track extraction: Extract audio tracks from video inputs and interleave them with video frames.

Model ID 	gemini-embedding-2-preview

Supported inputs & outputs 	

    Inputs: Text, Images, Audio, Video, PDF
    Outputs: Embeddings

Token limits

    Maximum input tokens: 8,192
    Maximum output tokens: N/A

Maximum sequence length

8,192 tokens

Output dimensions

Up to 3,072 (with MRL support)

Consumption options

    Supported
        Standard PayGo
    Not supported
        Provisioned Throughput
        Flex PayGo
        Priority PayGo
        Batch prediction

Technical specifications

Images

    Maximum images per prompt: 6
    Maximum file size per file for inline data or direct uploads through the console: No limit
    Maximum file size per file from Google Cloud Storage: No limit
    Maximum number of output images per prompt: N/A
    Supported MIME types: image/png, image/jpeg

Documents

    Maximum number of files per prompt: 1
    Maximum number of pages per file: 6
    Maximum file size per file: N/A
    Supported MIME types: application/pdf

Video

    Maximum video length (with audio): 80 seconds
    Maximum video length (without audio): 120 seconds
    Maximum number of videos per prompt: 1
    Supported MIME types: video/mpeg, video/mp4

Audio

    Maximum audio length per prompt: 80 seconds
    Maximum number of audio files per prompt: 1
    Supported MIME types: audio/mp3, audio/wav

Supported regions

    United States
        us-central1

Knowledge cutoff date 	November 2025

Versions

    gemini-embedding-2-preview
        Launch stage: Public preview
        Release date: March 10, 2026
