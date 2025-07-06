import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Code, FileText, Zap, Database, Shield, ArrowRight, Copy, ExternalLink } from "lucide-react";

export default function Documentation() {
  const apiEndpoints = [
    {
      method: "POST",
      endpoint: "/api/extract",
      description: "Extract data from uploaded document",
      params: ["file", "template_id", "custom_rules"]
    },
    {
      method: "GET",
      endpoint: "/api/templates",
      description: "List available extraction templates",
      params: ["user_id"]
    },
    {
      method: "POST",
      endpoint: "/api/templates",
      description: "Create custom extraction template",
      params: ["name", "columns", "rules"]
    },
    {
      method: "GET",
      endpoint: "/api/extractions/{id}",
      description: "Get extraction results",
      params: ["format"]
    }
  ];

  const codeExample = `
// Initialize Financial Extract API
const fe = new FinancialExtract({
  apiKey: 'your_api_key',
  environment: 'production'
});

// Extract data from document
const result = await fe.extract({
  file: documentFile,
  template: 'invoice_processing',
  customRules: {
    'invoice_number': 'Find the invoice ID or reference number',
    'total_amount': 'Extract the final total amount due'
  }
});

// Get results in preferred format
const data = await result.export('excel');
console.log(data);
`;

  return (
    <div className="min-h-screen py-20">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Hero Section */}
        <div className="text-center mb-16">
          <h1 className="text-5xl font-bold text-gray-900 mb-6">Documentation</h1>
          <p className="text-xl text-gray-600">
            Complete guide to integrating Financial Extract into your workflow
          </p>
        </div>

        {/* Quick Start */}
        <section className="mb-16">
          <h2 className="text-3xl font-bold text-gray-900 mb-8">Quick Start Guide</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card>
              <CardContent className="p-6">
                <div className="bg-blue-100 w-12 h-12 rounded-lg flex items-center justify-center mb-4">
                  <FileText className="w-6 h-6 text-blue-600" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">1. Upload Document</h3>
                <p className="text-gray-600">
                  Send PDF or image files to our extraction API endpoint with your authentication token.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="bg-green-100 w-12 h-12 rounded-lg flex items-center justify-center mb-4">
                  <Zap className="w-6 h-6 text-green-600" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">2. Configure Rules</h3>
                <p className="text-gray-600">
                  Use pre-built templates or create custom extraction rules for your specific document types.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="bg-purple-100 w-12 h-12 rounded-lg flex items-center justify-center mb-4">
                  <Database className="w-6 h-6 text-purple-600" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">3. Get Results</h3>
                <p className="text-gray-600">
                  Receive structured data in JSON, Excel, or CSV format ready for your applications.
                </p>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* API Reference */}
        <section className="mb-16">
          <h2 className="text-3xl font-bold text-gray-900 mb-8">API Reference</h2>
          <Card>
            <CardContent className="p-8">
              <div className="mb-6">
                <h3 className="text-xl font-semibold text-gray-900 mb-4">Base URL</h3>
                <div className="bg-gray-100 p-4 rounded-lg font-mono text-sm">
                  https://api.financialextract.com/v1
                </div>
              </div>

              <div className="space-y-6">
                <h3 className="text-xl font-semibold text-gray-900">Endpoints</h3>
                {apiEndpoints.map((endpoint, index) => (
                  <div key={index} className="border-l-4 border-blue-500 pl-6 py-4">
                    <div className="flex items-center space-x-3 mb-2">
                      <Badge variant={endpoint.method === "GET" ? "secondary" : "default"}>
                        {endpoint.method}
                      </Badge>
                      <code className="text-sm font-mono bg-gray-100 px-2 py-1 rounded">
                        {endpoint.endpoint}
                      </code>
                    </div>
                    <p className="text-gray-600 mb-2">{endpoint.description}</p>
                    <div className="text-sm text-gray-500">
                      Parameters: {endpoint.params.join(", ")}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </section>

        {/* Code Example */}
        <section className="mb-16">
          <h2 className="text-3xl font-bold text-gray-900 mb-8">Code Example</h2>
          <Card>
            <CardContent className="p-0">
              <div className="bg-gray-900 text-green-400 p-6 rounded-t-lg">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center space-x-2">
                    <Code className="w-5 h-5" />
                    <span className="font-medium">JavaScript SDK</span>
                  </div>
                  <Button variant="ghost" size="sm" className="text-green-400 hover:text-green-300">
                    <Copy className="w-4 h-4 mr-2" />
                    Copy
                  </Button>
                </div>
                <pre className="text-sm overflow-x-auto">
                  <code>{codeExample}</code>
                </pre>
              </div>
              <div className="p-6 bg-gray-50">
                <p className="text-gray-600 mb-4">
                  This example shows how to extract data from a document using our JavaScript SDK.
                </p>
                <div className="flex space-x-4">
                  <Button variant="outline" size="sm">
                    <ExternalLink className="w-4 h-4 mr-2" />
                    View Full SDK Docs
                  </Button>
                  <Button variant="outline" size="sm">
                    Download SDK
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* Authentication */}
        <section className="mb-16">
          <h2 className="text-3xl font-bold text-gray-900 mb-8">Authentication</h2>
          <Card>
            <CardContent className="p-8">
              <div className="flex items-start space-x-4 mb-6">
                <div className="bg-orange-100 w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0">
                  <Shield className="w-6 h-6 text-orange-600" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">API Key Authentication</h3>
                  <p className="text-gray-600 mb-4">
                    All API requests require authentication using your API key in the Authorization header.
                  </p>
                </div>
              </div>

              <div className="bg-gray-100 p-4 rounded-lg font-mono text-sm mb-4">
                Authorization: Bearer your_api_key_here
              </div>

              <div className="space-y-4">
                <div>
                  <h4 className="font-semibold text-gray-900 mb-2">Getting Your API Key</h4>
                  <ol className="list-decimal list-inside space-y-2 text-gray-600">
                    <li>Log into your Financial Extract dashboard</li>
                    <li>Navigate to Settings → API Keys</li>
                    <li>Click "Generate New Key"</li>
                    <li>Copy and securely store your key</li>
                  </ol>
                </div>

                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                  <p className="text-yellow-800 text-sm">
                    <strong>Security Note:</strong> Keep your API keys secure and never expose them in client-side code.
                    Use environment variables or secure key management systems.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* SDKs and Libraries */}
        <section className="mb-16">
          <h2 className="text-3xl font-bold text-gray-900 mb-8">SDKs & Libraries</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              { name: "JavaScript/Node.js", status: "Available" },
              { name: "Python", status: "Available" },
              { name: "PHP", status: "Available" },
              { name: "C# / .NET", status: "Coming Soon" },
              { name: "Java", status: "Coming Soon" },
              { name: "Ruby", status: "Coming Soon" }
            ].map((sdk, index) => (
              <Card key={index}>
                <CardContent className="p-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">{sdk.name}</h3>
                  <Badge variant={sdk.status === "Available" ? "default" : "secondary"}>
                    {sdk.status}
                  </Badge>
                  {sdk.status === "Available" && (
                    <div className="mt-4">
                      <Button variant="outline" size="sm" className="w-full">
                        <ExternalLink className="w-4 h-4 mr-2" />
                        View Docs
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* Support Section */}
        <section className="text-center bg-gray-50 rounded-lg p-12">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Need Integration Help?</h2>
          <p className="text-lg text-gray-600 mb-6">
            Our technical team can help you integrate Financial Extract into your existing workflow
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button className="lido-green hover:lido-green-dark text-white">
              Contact Technical Support
            </Button>
            <Button variant="outline">
              Schedule Integration Call
            </Button>
          </div>
        </section>
      </div>
    </div>
  );
}