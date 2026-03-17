# Get multimodal embeddings

To see an example of multimodal embeddings, run the "Intro to multimodal embeddings" notebook in one of the following environments:

Open in Colab | Open in Colab Enterprise | Open in Vertex AI Workbench | View on GitHub

The multimodal embeddings model generates multi-dimensional vectors based on the input you provide, which can include a combination of image, text, and video data. The embedding vectors can then be used for subsequent tasks like image classification or video content moderation.

The image embedding vector and text embedding vector are in the same semantic space with the same dimensionality. Consequently, these vectors can be used interchangeably for use cases like searching image by text, or searching video by image.

For text-only embedding use cases, we recommend using the Vertex AI text-embeddings API instead. For example, the text-embeddings API might be better for text-based semantic search, clustering, long-form document analysis, and other text retrieval or question-answering use cases. For more information, see Get text embeddings.
Supported models

You can get multimodal embeddings by using the following models:

    gemini-embedding-2-preview

    gemini-embedding-001

    multimodalembedding@001

Best practices

Consider the following input aspects when using the multimodal embeddings model:

    Text in images - The model can distinguish text in images, similar to optical character recognition (OCR). If you need to distinguish between a description of the image content and the text within an image, consider using prompt engineering to specify your target content. For example: instead of just "cat", specify "picture of a cat" or "the text 'cat'", depending on your use case.




    the text 'cat'
    	
    image of text with the word cat




    picture of a cat
    	
    image of a cat
    Image credit: Manja Vitolic on Unsplash.
    Embedding similarities - The dot product of embeddings isn't a calibrated probability. The dot product is a similarity metric and might have different score distributions for different use cases. Consequently, avoid using a fixed value threshold to measure quality. Instead, use ranking approaches for retrieval, or use sigmoid for classification.

API usage
API limits

The following limits apply when you use the multimodalembedding@001 model for text and image embeddings:
Limit 	Value and description
	Text and image data
Maximum number of API requests per minute per project 	120-600 depending on region
Maximum text length 	32 tokens (~32 words)

The maximum text length is 32 tokens (approximately 32 words). If the input exceeds 32 tokens, the model internally shortens the input to this length.
Language 	English
Image formats 	BMP, GIF, JPG, PNG
Image size 	Base64-encoded images: 20 MB (when transcoded to PNG)
Cloud Storage images: 20MB (original file format)

The maximum image size accepted is 20 MB. To avoid increased network latency, use smaller images. Additionally, the model resizes images to 512 x 512 pixel resolution. Consequently, you don't need to provide higher resolution images.
	Video data
Audio supported 	N/A - The model doesn't consider audio content when generating video embeddings
Video formats 	AVI, FLV, MKV, MOV, MP4, MPEG, MPG, WEBM, and WMV
Maximum video length (Cloud Storage) 	No limit. However, only 2 minutes of content can be analyzed at a time.
Before you begin

    In the Google Cloud console, go to the project selector page.

    Go to project selector

    Select or create a Google Cloud project.

    Roles required to select or create a project

    Verify that billing is enabled for your Google Cloud project.

    Enable the Vertex AI API.

    Roles required to enable APIs

    Enable the API
    Certain tasks in Vertex AI require that you use additional Google Cloud products besides Vertex AI. For example, in most cases, you must use Cloud Storage and Artifact Registry when you create a custom training pipeline. You might need to perform additional setup tasks to use other Google Cloud products.

    Set up authentication for your environment.

    Select the tab for how you plan to use the samples on this page:
    Java
    Node.js
    Python
    REST

    To use the Java samples on this page in a local development environment, install and initialize the gcloud CLI, and then set up Application Default Credentials with your user credentials.

        Install the Google Cloud CLI.

        After initializing the gcloud CLI, update it and install the required components:

        gcloud components update
        gcloud components install 

        If you're using a local shell, then create local authentication credentials for your user account:

        gcloud auth application-default login

        You don't need to do this if you're using Cloud Shell.

        If an authentication error is returned, and you are using an external identity provider (IdP), confirm that you have signed in to the gcloud CLI with your federated identity.

    For more information, see Set up ADC for a local development environment in the Google Cloud authentication documentation.
    To use the Python SDK, follow instructions at Install the Vertex AI SDK for Python. For more information, see the Vertex AI SDK for Python API reference documentation.
    Optional. Review pricing for this feature. Pricing for embeddings depends on the type of data you send (such as image or text), and also depends on the mode you use for certain data types (such as Video Plus, Video Standard, or Video Essential).

Locations

A location is a region you can specify in a request to control where data is stored at rest. For a list of available regions, see Generative AI on Vertex AI locations.
Error messages
Quota exceeded error

google.api_core.exceptions.ResourceExhausted: 429 Quota exceeded for
aiplatform.googleapis.com/online_prediction_requests_per_base_model with base
model: multimodalembedding. Please submit a quota increase request.

If this is the first time you receive this error, use the Google Cloud console to request a quota adjustment for your project. Use the following filters before requesting your adjustment:

    Service ID: aiplatform.googleapis.com
    metric: aiplatform.googleapis.com/online_prediction_requests_per_base_model
    base_model:multimodalembedding

Go to Quotas

If you have already sent a quota adjustment request, wait before sending another request. If you need to further increase the quota, repeat the quota adjustment request with your justification for a sustained quota adjustment.
Specify lower-dimension embeddings

Depending on the model being used, an embedding request returns either a 1408 float vector or a 3072 float vector. You can specify lower dimension embeddings for text and image data to optimize for latency and storage, or quality. Lower dimension embeddings lower storage needs and provide lower latency for subsequent embedding tasks (such as search or recommendation). Higher-dimension embeddings offer greater accuracy for these tasks, but with higher storage needs and higher latency.

The following table illustrates the default and available lower dimensions available for each model:
Model 	Default dimensions (highest) 	Supported dimensions (range) 	Recommended lower dimensions
gemini-embedding-2-preview 	3072 	128 to 3072 	128, 768 or 1536
gemini-embedding-001 	3072 	128 to 3072 	128, 768 or 1536
multimodalembedding@001 	1408 	128 to 1408 	128, 256, or 512

Use the following samples to generate embeddings with lower dimensions:
REST
Python
Go

Lower dimensions can be accessed by adding the parameters.dimension field. The parameter accepts any of the dimension values available for the model. For example, you can specify 128, 256, 512 or 1408 when using the multimodalembedding@001 model. The response includes the embedding of the specified dimension.

Before using any of the request data, make the following replacements:

    LOCATION: Your project's region. For example, us-central1, europe-west2, or asia-northeast3. For a list of available regions, see Generative AI on Vertex AI locations. When a regional API endpoint is used, the region from the endpoint's URL determines where the request is processed, and this LOCATION in the resource path is ignored if it conflicts.
    PROJECT_ID: Your Google Cloud project ID.
    IMAGE_URI: The Cloud Storage URI of the target image to get embeddings for. For example, gs://my-bucket/embeddings/supermarket-img.png.

    You can also provide the image as a base64-encoded byte string:
    TEXT: The target text to get embeddings for. For example, a cat.
    EMBEDDING_DIMENSION: The number of embedding dimensions. Lower values offer decreased latency when using these embeddings for subsequent tasks, while higher values offer better accuracy. Available values: 128, 256, 512, and 1408 (default).

HTTP method and URL:

POST https://LOCATION-aiplatform.googleapis.com/v1/projects/PROJECT_ID/locations/LOCATION/publishers/google/models/multimodalembedding@001:predict

Request JSON body:

{
  "instances": [
    {
      "image": {
        "gcsUri": "IMAGE_URI"
      },
      "text": "TEXT"
    }
  ],
  "parameters": {
    "dimension": EMBEDDING_DIMENSION
  }
}

To send your request, choose one of these options:
curl
PowerShell
Note: The following command assumes that you have logged in to the gcloud CLI with your user account by running gcloud init or gcloud auth login , or by using Cloud Shell, which automatically logs you into the gcloud CLI . You can check the currently active account by running gcloud auth list.

Save the request body in a file named request.json, and execute the following command:

curl -X POST \
     -H "Authorization: Bearer $(gcloud auth print-access-token)" \
     -H "Content-Type: application/json; charset=utf-8" \
     -d @request.json \
     "https://LOCATION-aiplatform.googleapis.com/v1/projects/PROJECT_ID/locations/LOCATION/publishers/google/models/multimodalembedding@001:predict"

The embedding the model returns a float vector of the dimension you specify. The following sample responses are shortened for space.

128 dimensions:

{
  "predictions": [
    {
      "imageEmbedding": [
        0.0279239565,
        [...128 dimension vector...]
        0.00403284049
      ],
      "textEmbedding": [
        0.202921599,
        [...128 dimension vector...]
        -0.0365431122
      ]
    }
  ],
  "deployedModelId": "DEPLOYED_MODEL_ID"
}

256 dimensions:

{
  "predictions": [
    {
      "imageEmbedding": [
        0.248620048,
        [...256 dimension vector...]
        -0.0646447465
      ],
      "textEmbedding": [
        0.0757875815,
        [...256 dimension vector...]
        -0.02749932
      ]
    }
  ],
  "deployedModelId": "DEPLOYED_MODEL_ID"
}

512 dimensions:

{
  "predictions": [
    {
      "imageEmbedding": [
        -0.0523675755,
        [...512 dimension vector...]
        -0.0444030389
      ],
      "textEmbedding": [
        -0.0592851527,
        [...512 dimension vector...]
        0.0350437127
      ]
    }
  ],
  "deployedModelId": "DEPLOYED_MODEL_ID"
}

Send an embedding request (image and text)
Note: For text-only embedding use cases, we recommend using the Vertex AI text-embeddings API instead. For example, the text-embeddings API might be better for text-based semantic search, clustering, long-form document analysis, and other text retrieval or question-answering use cases. For more information, see Get text embeddings.

Use the following code samples to send an embedding request with image and text data. The samples show how to send a request with both data types, but you can also use the service with an individual data type.
Get text and image embeddings
REST
Python
Node.js
Java
Go

For more information about multimodalembedding@001 model requests, see the multimodalembedding@001 model API reference.

Before using any of the request data, make the following replacements:

    LOCATION: Your project's region. For example, us-central1, europe-west2, or asia-northeast3. For a list of available regions, see Generative AI on Vertex AI locations. When a regional API endpoint is used, the region from the endpoint's URL determines where the request is processed, and this LOCATION in the resource path is ignored if it conflicts.
    PROJECT_ID: Your Google Cloud project ID.
    TEXT: The target text to get embeddings for. For example, a cat.
    B64_ENCODED_IMG: The target image to get embeddings for. The image must be specified as a base64-encoded byte string.

HTTP method and URL:

POST https://LOCATION-aiplatform.googleapis.com/v1/projects/PROJECT_ID/locations/LOCATION/publishers/google/models/multimodalembedding@001:predict

Request JSON body:

{
  "instances": [
    {
      "text": "TEXT",
      "image": {
        "bytesBase64Encoded": "B64_ENCODED_IMG"
      }
    }
  ]
}

To send your request, choose one of these options:
curl
PowerShell
Note: The following command assumes that you have logged in to the gcloud CLI with your user account by running gcloud init or gcloud auth login , or by using Cloud Shell, which automatically logs you into the gcloud CLI . You can check the currently active account by running gcloud auth list.

Save the request body in a file named request.json, and execute the following command:

curl -X POST \
     -H "Authorization: Bearer $(gcloud auth print-access-token)" \
     -H "Content-Type: application/json; charset=utf-8" \
     -d @request.json \
     "https://LOCATION-aiplatform.googleapis.com/v1/projects/PROJECT_ID/locations/LOCATION/publishers/google/models/multimodalembedding@001:predict"

The embedding the model returns is a 1408 float vector. The following sample response is shortened for space.

{
  "predictions": [
    {
      "textEmbedding": [
        0.010477379,
        -0.00399621,
        0.00576670747,
        [...]
        -0.00823613815,
        -0.0169572588,
        -0.00472954148
      ],
      "imageEmbedding": [
        0.00262696808,
        -0.00198890246,
        0.0152047109,
        -0.0103145819,
        [...]
        0.0324628279,
        0.0284924973,
        0.011650892,
        -0.00452344026
      ]
    }
  ],
  "deployedModelId": "DEPLOYED_MODEL_ID"
}

Send an embedding request (video, image, or text)

When sending an embedding request you can specify an input video alone, or you can specify a combination of video, image, and text data.
Video embedding modes

There are three modes you can use with video embeddings: Essential, Standard, or Plus. The mode corresponds to the density of the embeddings generated, which can be specified by the interval_sec config in the request. For each video interval with interval_sec length, an embedding is generated. The minimal video interval length is 4 seconds. Interval lengths greater than 120 seconds might negatively affect the quality of the generated embeddings.

Pricing for video embedding depends on the mode you use. For more information, see pricing.

The following table summarizes the three modes you can use for video embeddings:
Mode 	Maximum number of embeddings per minute 	Video embedding interval (minimum value)
Essential 	4 	15

This corresponds to: intervalSec >= 15
Standard 	8 	8

This corresponds to: 8 <= intervalSec < 15
Plus 	15 	4

This corresponds to: 4 <= intervalSec < 8
Video embeddings best practices

Consider the following when you send video embedding requests:

    To generate a single embedding for the first two minutes of an input video of any length, use the following videoSegmentConfig setting:

    request.json:

    // other request body content
    "videoSegmentConfig": {
      "intervalSec": 120
    }
    // other request body content

    To generate embedding for a video with a length greater than two minutes, you can send multiple requests that specify the start and end times in the videoSegmentConfig:

    request1.json:

    // other request body content
    "videoSegmentConfig": {
      "startOffsetSec": 0,
      "endOffsetSec": 120
    }
    // other request body content

    request2.json:

    // other request body content
    "videoSegmentConfig": {
      "startOffsetSec": 120,
      "endOffsetSec": 240
    }
    // other request body content

Get video embeddings

Use the following sample to get embeddings for video content alone.
REST
Python
Go

For more information about multimodalembedding@001 model requests, see the multimodalembedding@001 model API reference.

The following example uses a video located in Cloud Storage. You can also use the video.bytesBase64Encoded field to provide a base64-encoded string representation of the video.

Before using any of the request data, make the following replacements:

    LOCATION: Your project's region. For example, us-central1, europe-west2, or asia-northeast3. For a list of available regions, see Generative AI on Vertex AI locations. When a regional API endpoint is used, the region from the endpoint's URL determines where the request is processed, and this LOCATION in the resource path is ignored if it conflicts.
    PROJECT_ID: Your Google Cloud project ID.
    VIDEO_URI: The Cloud Storage URI of the target video to get embeddings for. For example, gs://my-bucket/embeddings/supermarket-video.mp4.

    You can also provide the video as a base64-encoded byte string:
    videoSegmentConfig (START_SECOND, END_SECOND, INTERVAL_SECONDS). Optional. The specific video segments (in seconds) the embeddings are generated for.
    The value you set for videoSegmentConfig.intervalSec affects the pricing tier you are charged at. For more information, see the video embedding modes section and pricing page.

    For example:

    [...]
    "videoSegmentConfig": {
      "startOffsetSec": 10,
      "endOffsetSec": 60,
      "intervalSec": 10
    }
    [...]

    Using this config specifies video data from 10 seconds to 60 seconds and generates embeddings for the following 10 second video intervals: [10, 20), [20, 30), [30, 40), [40, 50), [50, 60). This video interval ("intervalSec": 10) falls in the Standard video embedding mode, and the user is charged at the Standard mode pricing rate.

    If you omit videoSegmentConfig, the service uses the following default values: "videoSegmentConfig": { "startOffsetSec": 0, "endOffsetSec": 120, "intervalSec": 16 }. This video interval ("intervalSec": 16) falls in the Essential video embedding mode, and the user is charged at the Essential mode pricing rate.

HTTP method and URL:

POST https://LOCATION-aiplatform.googleapis.com/v1/projects/PROJECT_ID/locations/LOCATION/publishers/google/models/multimodalembedding@001:predict

Request JSON body:

{
  "instances": [
    {
      "video": {
        "gcsUri": "VIDEO_URI",
        "videoSegmentConfig": {
          "startOffsetSec": START_SECOND,
          "endOffsetSec": END_SECOND,
          "intervalSec": INTERVAL_SECONDS
        }
      }
    }
  ]
}

To send your request, choose one of these options:
curl
PowerShell
Note: The following command assumes that you have logged in to the gcloud CLI with your user account by running gcloud init or gcloud auth login , or by using Cloud Shell, which automatically logs you into the gcloud CLI . You can check the currently active account by running gcloud auth list.

Save the request body in a file named request.json, and execute the following command:

curl -X POST \
     -H "Authorization: Bearer $(gcloud auth print-access-token)" \
     -H "Content-Type: application/json; charset=utf-8" \
     -d @request.json \
     "https://LOCATION-aiplatform.googleapis.com/v1/projects/PROJECT_ID/locations/LOCATION/publishers/google/models/multimodalembedding@001:predict"

The embedding the model returns is a 1408 float vector. The following sample responses are shortened for space.

Response (7 second video, no videoSegmentConfig specified):

{
  "predictions": [
    {
      "videoEmbeddings": [
        {
          "endOffsetSec": 7,
          "embedding": [
            -0.0045467657,
            0.0258095954,
            0.0146885719,
            0.00945400633,
            [...]
            -0.0023291884,
            -0.00493789,
            0.00975185353,
            0.0168156829
          ],
          "startOffsetSec": 0
        }
      ]
    }
  ],
  "deployedModelId": "DEPLOYED_MODEL_ID"
}

Response (59 second video, with the following video segment config: "videoSegmentConfig": { "startOffsetSec": 0, "endOffsetSec": 60, "intervalSec": 10 }):

{
  "predictions": [
    {
      "videoEmbeddings": [
        {
          "endOffsetSec": 10,
          "startOffsetSec": 0,
          "embedding": [
            -0.00683252793,
            0.0390476175,
            [...]
            0.00657121744,
            0.013023301
          ]
        },
        {
          "startOffsetSec": 10,
          "endOffsetSec": 20,
          "embedding": [
            -0.0104404651,
            0.0357737206,
            [...]
            0.00509833824,
            0.0131902946
          ]
        },
        {
          "startOffsetSec": 20,
          "embedding": [
            -0.0113538112,
            0.0305239167,
            [...]
            -0.00195809244,
            0.00941874553
          ],
          "endOffsetSec": 30
        },
        {
          "embedding": [
            -0.00299320649,
            0.0322436653,
            [...]
            -0.00993082579,
            0.00968887936
          ],
          "startOffsetSec": 30,
          "endOffsetSec": 40
        },
        {
          "endOffsetSec": 50,
          "startOffsetSec": 40,
          "embedding": [
            -0.00591270532,
            0.0368893594,
            [...]
            -0.00219071587,
            0.0042470959
          ]
        },
        {
          "embedding": [
            -0.00458270218,
            0.0368121453,
            [...]
            -0.00317760976,
            0.00595594104
          ],
          "endOffsetSec": 59,
          "startOffsetSec": 50
        }
      ]
    }
  ],
  "deployedModelId": "DEPLOYED_MODEL_ID"
}

Get image, text, and video embeddings

Use the following sample to get embeddings for video, text, and image content.
REST
Python
Go

For more information about multimodalembedding@001 model requests, see the multimodalembedding@001 model API reference.

The following example uses image, text, and video data. You can use any combination of these data types in your request body.

Additionally, this sample uses a video located in Cloud Storage. You can also use the video.bytesBase64Encoded field to provide a base64-encoded string representation of the video.

Before using any of the request data, make the following replacements:

    LOCATION: Your project's region. For example, us-central1, europe-west2, or asia-northeast3. For a list of available regions, see Generative AI on Vertex AI locations. When a regional API endpoint is used, the region from the endpoint's URL determines where the request is processed, and this LOCATION in the resource path is ignored if it conflicts.
    PROJECT_ID: Your Google Cloud project ID.
    TEXT: The target text to get embeddings for. For example, a cat.
    IMAGE_URI: The Cloud Storage URI of the target image to get embeddings for. For example, gs://my-bucket/embeddings/supermarket-img.png.

    You can also provide the image as a base64-encoded byte string:
    VIDEO_URI: The Cloud Storage URI of the target video to get embeddings for. For example, gs://my-bucket/embeddings/supermarket-video.mp4.

    You can also provide the video as a base64-encoded byte string:
    videoSegmentConfig (START_SECOND, END_SECOND, INTERVAL_SECONDS). Optional. The specific video segments (in seconds) the embeddings are generated for.
    The value you set for videoSegmentConfig.intervalSec affects the pricing tier you are charged at. For more information, see the video embedding modes section and pricing page.

    For example:

    [...]
    "videoSegmentConfig": {
      "startOffsetSec": 10,
      "endOffsetSec": 60,
      "intervalSec": 10
    }
    [...]

    Using this config specifies video data from 10 seconds to 60 seconds and generates embeddings for the following 10 second video intervals: [10, 20), [20, 30), [30, 40), [40, 50), [50, 60). This video interval ("intervalSec": 10) falls in the Standard video embedding mode, and the user is charged at the Standard mode pricing rate.

    If you omit videoSegmentConfig, the service uses the following default values: "videoSegmentConfig": { "startOffsetSec": 0, "endOffsetSec": 120, "intervalSec": 16 }. This video interval ("intervalSec": 16) falls in the Essential video embedding mode, and the user is charged at the Essential mode pricing rate.

HTTP method and URL:

POST https://LOCATION-aiplatform.googleapis.com/v1/projects/PROJECT_ID/locations/LOCATION/publishers/google/models/multimodalembedding@001:predict

Request JSON body:

{
  "instances": [
    {
      "text": "TEXT",
      "image": {
        "gcsUri": "IMAGE_URI"
      },
      "video": {
        "gcsUri": "VIDEO_URI",
        "videoSegmentConfig": {
          "startOffsetSec": START_SECOND,
          "endOffsetSec": END_SECOND,
          "intervalSec": INTERVAL_SECONDS
        }
      }
    }
  ]
}

To send your request, choose one of these options:
curl
PowerShell
Note: The following command assumes that you have logged in to the gcloud CLI with your user account by running gcloud init or gcloud auth login , or by using Cloud Shell, which automatically logs you into the gcloud CLI . You can check the currently active account by running gcloud auth list.

Save the request body in a file named request.json, and execute the following command:

curl -X POST \
     -H "Authorization: Bearer $(gcloud auth print-access-token)" \
     -H "Content-Type: application/json; charset=utf-8" \
     -d @request.json \
     "https://LOCATION-aiplatform.googleapis.com/v1/projects/PROJECT_ID/locations/LOCATION/publishers/google/models/multimodalembedding@001:predict"

The embedding the model returns is a 1408 float vector. The following sample response is shortened for space.

{
  "predictions": [
    {
      "textEmbedding": [
        0.0105433334,
        -0.00302835181,
        0.00656806398,
        0.00603460241,
        [...]
        0.00445805816,
        0.0139605571,
        -0.00170318608,
        -0.00490092579
      ],
      "videoEmbeddings": [
        {
          "startOffsetSec": 0,
          "endOffsetSec": 7,
          "embedding": [
            -0.00673126569,
            0.0248149596,
            0.0128901172,
            0.0107588246,
            [...]
            -0.00180952181,
            -0.0054573305,
            0.0117037306,
            0.0169312079
          ]
        }
      ],
      "imageEmbedding": [
        -0.00728622358,
        0.031021487,
        -0.00206603738,
        0.0273937676,
        [...]
        -0.00204976718,
        0.00321615417,
        0.0121978866,
        0.0193375275
      ]
    }
  ],
  "deployedModelId": "DEPLOYED_MODEL_ID"
}

What's next

    Read the blog "What is Multimodal Search: 'LLMs with vision' change businesses".
    For information about text-only use cases (text-based semantic search, clustering, long-form document analysis, and other text retrieval or question-answering use cases), read Get text embeddings.
    View all Vertex AI image generative AI offerings in the Imagen on Vertex AI overview.
    Explore more pretrained models in Model Garden.
    Learn about responsible AI best practices and safety filters in Vertex AI.
