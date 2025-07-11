'use client'

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Check, CloudUpload, Database, Table, Bot, Shield, ShieldX, Lock, Ban, Star, FileText, Grid3X3, Settings } from "lucide-react";
import { FaGoogle, FaMicrosoft, FaFileExcel } from "react-icons/fa";

export default function Home() {
  const [email, setEmail] = useState("");
  const router = useRouter();
  const [isDragOver, setIsDragOver] = useState(false);
  const { user } = useAuth();

  const handleGetStarted = () => {
    // Redirect based on authentication status
    if (user) {
      router.push("/dashboard");
    } else {
      router.push("/demo");
    }
  };

  const handleFileUpload = (files: FileList | null) => {
    if (files && files.length > 0) {
      // Store files in sessionStorage for demo purposes
      const fileNames = Array.from(files).map(file => file.name);
      sessionStorage.setItem('uploadedFiles', JSON.stringify(fileNames));
      router.push("/demo");
    }
  };

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    handleFileUpload(e.dataTransfer.files);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <section className="bg-gradient-to-br from-green-50 to-white py-20">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <div>
              <h1 className="text-5xl font-bold text-gray-900 mb-2">
                True GenAI Customizable Extraction
              </h1>
              <p className="text-lg text-gray-500 mb-8">
                Programmed by real CPA and lawyer for practical professional use
              </p>
              <p className="text-xl text-gray-600 mb-8">
                Professional-grade AI extraction built with deep accounting and legal expertise.
              </p>
              
              <div className="space-y-4 mb-8 flex flex-col items-center">
                <div className="flex items-center space-x-3">
                  <Check className="text-green-500 w-5 h-5" />
                  <span className="text-gray-700">CPA-designed extraction rules for financial compliance</span>
                </div>
                <div className="flex items-center space-x-3">
                  <Check className="text-green-500 w-5 h-5" />
                  <span className="text-gray-700">Lawyer-validated data processing for legal requirements</span>
                </div>
                <div className="flex items-center space-x-3">
                  <Check className="text-green-500 w-5 h-5" />
                  <span className="text-gray-700">Custom workflows for enterprise-grade automation</span>
                </div>
              </div>

              {/* Investment Statement Example */}
              <div className="mb-8 flex justify-center">
                <Card className="shadow-lg max-w-2xl">
                  <CardContent className="p-4">
                    <div className="border border-gray-200 rounded-lg overflow-hidden">
                      <div className="bg-gray-50 px-4 py-2 border-b border-gray-200 flex items-center space-x-2">
                        <div className="w-3 h-3 bg-red-400 rounded-full"></div>
                        <div className="w-3 h-3 bg-yellow-400 rounded-full"></div>
                        <div className="w-3 h-3 bg-green-400 rounded-full"></div>
                        <span className="text-sm text-gray-600 ml-2">Investment Statement Extract</span>
                      </div>
                      <div className="p-3">
                        <div className="grid grid-cols-6 gap-1 text-xs">
                          <div className="bg-blue-100 p-2 rounded text-center font-medium">Portfolio Co.</div>
                          <div className="bg-blue-100 p-2 rounded text-center font-medium">Quarter</div>
                          <div className="bg-blue-100 p-2 rounded text-center font-medium">Revenue</div>
                          <div className="bg-blue-100 p-2 rounded text-center font-medium">EBITDA</div>
                          <div className="bg-blue-100 p-2 rounded text-center font-medium">Growth %</div>
                          <div className="bg-blue-100 p-2 rounded text-center font-medium">Valuation</div>
                          <div className="p-2 text-center">TechFlow Inc</div>
                          <div className="p-2 text-center">Q4 2024</div>
                          <div className="p-2 text-center">$12.5M</div>
                          <div className="p-2 text-center">$3.2M</div>
                          <div className="p-2 text-center">23%</div>
                          <div className="p-2 text-center">$85M</div>
                          <div className="p-2 text-center">DataMind Corp</div>
                          <div className="p-2 text-center">Q4 2024</div>
                          <div className="p-2 text-center">$8.7M</div>
                          <div className="p-2 text-center">$1.9M</div>
                          <div className="p-2 text-center">31%</div>
                          <div className="p-2 text-center">$62M</div>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
              
              <div className="space-y-4 flex flex-col items-center">
                <div className="flex items-center space-x-2 max-w-md">
                  <Input 
                    type="email" 
                    placeholder="Your work email" 
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="flex-1"
                  />
                  <Button 
                    onClick={handleGetStarted}
                    className="lido-green hover:lido-green-dark text-white px-6"
                  >
                    Get started for free →
                  </Button>
                </div>
                <div className="flex items-center space-x-4 text-sm text-gray-500">
                  <div className="flex items-center space-x-1">
                    <Check className="text-green-500 w-4 h-4" />
                    <span>No credit card required</span>
                  </div>
                  <div className="flex items-center space-x-1">
                    <Check className="text-green-500 w-4 h-4" />
                    <span>10 free pages</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>



      {/* Demo Section */}
      <section className="py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-4xl font-bold text-gray-900 mb-4">Try it now</h2>
            <p className="text-xl text-gray-600">Upload your own PDFs and see how FinancialExtract works with your documents.</p>
          </div>
          
          <Card 
            className={`border-2 border-dashed transition-colors cursor-pointer ${
              isDragOver ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-blue-500'
            }`}
            onDrop={handleFileDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
          >
            <CardContent className="p-12 text-center">
              <CloudUpload className={`w-16 h-16 mx-auto mb-4 ${isDragOver ? 'text-blue-500' : 'text-gray-400'}`} />
              <h3 className="text-xl font-semibold text-gray-900 mb-2">Upload File</h3>
              <p className="text-gray-600 mb-4">Click to upload or drag and drop your PDF files here</p>
              <input
                type="file"
                multiple
                accept=".pdf,.jpg,.jpeg,.png"
                onChange={(e) => handleFileUpload(e.target.files)}
                className="hidden"
                id="file-upload"
              />
              <label htmlFor="file-upload">
                <Button className="lido-blue hover:lido-blue-dark text-white" asChild>
                  <span>Choose Files</span>
                </Button>
              </label>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-gray-900 mb-4">Everything you need to extract data from any file</h2>
            <p className="text-xl text-gray-600">No complex training required — just type in plain English.</p>
          </div>
          
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-stretch">
            <Link href="/features" className="block">
              <Card className="hover:shadow-xl transition-shadow cursor-pointer h-full flex flex-col">
                <CardContent className="p-8 flex-1 flex flex-col">
                  <div className="bg-blue-100 w-16 h-16 rounded-lg flex items-center justify-center mb-6">
                    <FileText className="text-blue-600 w-8 h-8" />
                  </div>
                  <h3 className="text-xl font-bold text-gray-900 mb-4">Data extractor</h3>
                  <p className="text-gray-600 mb-4 flex-1">Intelligently extract and structure key information from any document type with precision.</p>
                  <div className="space-y-2 text-sm text-gray-500 mt-auto">
                    <div>• Financial statements</div>
                    <div>• Contract documents</div>
                    <div>• Medical records</div>
                    <div>• Legal forms</div>
                  </div>
                </CardContent>
              </Card>
            </Link>
            
            <Link href="/features" className="block">
              <Card className="hover:shadow-xl transition-shadow cursor-pointer h-full flex flex-col">
                <CardContent className="p-8 flex-1 flex flex-col">
                  <div className="bg-purple-100 w-16 h-16 rounded-lg flex items-center justify-center mb-6">
                    <Grid3X3 className="text-purple-600 w-8 h-8" />
                  </div>
                  <h3 className="text-xl font-bold text-gray-900 mb-4">Table extractor</h3>
                  <p className="text-gray-600 mb-4 flex-1">Advanced table recognition that captures complex layouts and preserves data relationships.</p>
                  <div className="space-y-2 text-sm text-gray-500 mt-auto">
                    <div>• Multi-page reports</div>
                    <div>• Complex spreadsheets</div>
                    <div>• Financial tables</div>
                    <div>• Data matrices</div>
                  </div>
                </CardContent>
              </Card>
            </Link>
            
            <Link href="/features" className="block">
              <Card className="hover:shadow-xl transition-shadow cursor-pointer h-full flex flex-col">
                <CardContent className="p-8 flex-1 flex flex-col">
                  <div className="bg-orange-100 w-16 h-16 rounded-lg flex items-center justify-center mb-6">
                    <Settings className="text-orange-600 w-8 h-8" />
                  </div>
                  <h3 className="text-xl font-bold text-gray-900 mb-4">Custom extraction at will</h3>
                  <p className="text-gray-600 mb-4 flex-1">Create custom columns with self-defined formats and prompts. Classify data and add details like G/L codes.</p>
                  <div className="space-y-2 text-sm text-gray-500 mt-auto">
                    <div>• Custom data formats</div>
                    <div>• Classification rules</div>
                    <div>• Accounting codes</div>
                    <div>• Smart categorization</div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          </div>
        </div>
      </section>

      {/* Testimonials Section */}
      <section className="py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-gray-900 mb-4">What our customers are saying</h2>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <Card>
              <CardContent className="p-8">
                <div className="w-16 h-16 rounded-full mb-4 bg-blue-100 flex items-center justify-center">
                  <span className="text-blue-600 font-bold text-lg">AM</span>
                </div>
                <div className="mb-4">
                  <h4 className="font-semibold text-gray-900">Apex Manufacturing</h4>
                  <p className="text-gray-600 text-sm">David Wilson, Supply Chain Director</p>
                </div>
                <h5 className="font-bold text-lg mb-2">Handles complex supplier documents</h5>
                <p className="text-gray-600">"We process thousands of supplier certifications, quality reports, and invoices monthly. The custom extraction feature lets us automatically categorize materials by grade and extract compliance codes for our ERP system."</p>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="p-8">
                <div className="w-16 h-16 rounded-full mb-4 bg-green-100 flex items-center justify-center">
                  <span className="text-green-600 font-bold text-lg">SV</span>
                </div>
                <div className="mb-4">
                  <h4 className="font-semibold text-gray-900">Summit Ventures</h4>
                  <p className="text-gray-600 text-sm">Jennifer Park, Partner</p>
                </div>
                <h5 className="font-bold text-lg mb-2">Essential for due diligence</h5>
                <p className="text-gray-600">"We evaluate hundreds of companies quarterly. Extracting financial metrics, revenue breakdowns, and key performance indicators from pitch decks and financial statements used to take weeks. Now it's done in hours."</p>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="p-8">
                <div className="w-16 h-16 rounded-full mb-4 bg-purple-100 flex items-center justify-center">
                  <span className="text-purple-600 font-bold text-lg">NX</span>
                </div>
                <div className="mb-4">
                  <h4 className="font-semibold text-gray-900">NexaFlow Technologies</h4>
                  <p className="text-gray-600 text-sm">Alex Kumar, CTO</p>
                </div>
                <h5 className="font-bold text-lg mb-2">Accelerates contract processing</h5>
                <p className="text-gray-600">"Our legal team reviews hundreds of vendor agreements monthly. We now extract key terms, pricing structures, and SLA commitments automatically. What used to take 3 hours per contract now takes 15 minutes."</p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>



      {/* Case Study Section */}
      <section className="py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <Card className="bg-gradient-to-r from-blue-500 to-blue-600 text-white">
            <CardContent className="p-12 text-center">
              <img src="https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?ixlib=rb-4.0.3&w=600&h=200&fit=crop" alt="NextWorld Capital" className="mx-auto mb-6 rounded-lg" />
              <h2 className="text-3xl font-bold mb-4">NextWorld Capital saves hundreds of hours per year processing investment statements</h2>
              <p className="text-xl mb-6">"Our team used to spend weeks manually extracting financial data from portfolio reports. Now we process quarterly statements from 200+ companies in just hours with perfect accuracy."</p>
              <Link href="/case-study/nextworld-capital">
                <Button className="bg-white text-blue-600 hover:bg-gray-100">
                  Read the full case study →
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Security Section */}
      <section className="py-20 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-gray-900 mb-4">🔐 Enterprise grade security and compliance</h2>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            <div className="text-center">
              <div className="bg-red-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                <Ban className="text-red-600 w-8 h-8" />
              </div>
              <h4 className="font-semibold text-gray-900 mb-2">Files Immediately Deleted Post-processing</h4>
            </div>
            
            <div className="text-center">
              <div className="bg-blue-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                <Shield className="text-blue-600 w-8 h-8" />
              </div>
              <h4 className="font-semibold text-gray-900 mb-2">Server Is Hosted in U.S.A. Only</h4>
            </div>
            
            <div className="text-center">
              <div className="bg-purple-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                <Lock className="text-purple-600 w-8 h-8" />
              </div>
              <h4 className="font-semibold text-gray-900 mb-2">AES-256 Encryption</h4>
            </div>
            
            <div className="text-center">
              <div className="bg-red-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                <Ban className="text-red-600 w-8 h-8" />
              </div>
              <h4 className="font-semibold text-gray-900 mb-2">No Training on Your Data</h4>
            </div>
          </div>
        </div>
      </section>


    </div>
  );
}
