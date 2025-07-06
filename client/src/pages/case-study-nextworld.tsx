import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Check, ArrowLeft, TrendingUp, Clock, Users, DollarSign } from "lucide-react";
import { Link } from "wouter";

export default function CaseStudyNextWorld() {
  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <section className="bg-gradient-to-r from-blue-500 to-blue-600 text-white py-20">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <Link href="/" className="inline-flex items-center text-blue-100 hover:text-white mb-8">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Home
          </Link>
          
          <div className="text-center">
            <img 
              src="https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?ixlib=rb-4.0.3&w=800&h=300&fit=crop" 
              alt="NextWorld Capital office" 
              className="mx-auto mb-8 rounded-xl shadow-lg"
            />
            <h1 className="text-5xl font-bold mb-6">NextWorld Capital Case Study</h1>
            <p className="text-xl text-blue-100">How a leading VC firm automated investment statement processing and saved hundreds of hours annually</p>
          </div>
        </div>
      </section>

      {/* Key Metrics */}
      <section className="py-16 bg-gray-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            <Card>
              <CardContent className="p-6 text-center">
                <Clock className="w-12 h-12 text-blue-600 mx-auto mb-4" />
                <div className="text-3xl font-bold text-gray-900 mb-2">400+</div>
                <p className="text-gray-600">Hours saved annually</p>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="p-6 text-center">
                <Users className="w-12 h-12 text-green-600 mx-auto mb-4" />
                <div className="text-3xl font-bold text-gray-900 mb-2">200+</div>
                <p className="text-gray-600">Portfolio companies processed</p>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="p-6 text-center">
                <TrendingUp className="w-12 h-12 text-purple-600 mx-auto mb-4" />
                <div className="text-3xl font-bold text-gray-900 mb-2">95%</div>
                <p className="text-gray-600">Reduction in processing time</p>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="p-6 text-center">
                <DollarSign className="w-12 h-12 text-orange-600 mx-auto mb-4" />
                <div className="text-3xl font-bold text-gray-900 mb-2">$150K</div>
                <p className="text-gray-600">Annual cost savings</p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Company Overview */}
      <section className="py-16">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="text-3xl font-bold text-gray-900 mb-6">About NextWorld Capital</h2>
              <p className="text-lg text-gray-600 mb-6">
                NextWorld Capital is a leading venture capital firm managing over $2.5 billion in assets across 
                multiple funds. With a portfolio of 200+ companies spanning fintech, healthcare, and enterprise 
                software, they require extensive due diligence and ongoing portfolio monitoring.
              </p>
              <div className="space-y-3">
                <div className="flex items-center space-x-3">
                  <Check className="text-blue-500 w-5 h-5" />
                  <span>$2.5B+ assets under management</span>
                </div>
                <div className="flex items-center space-x-3">
                  <Check className="text-blue-500 w-5 h-5" />
                  <span>200+ portfolio companies</span>
                </div>
                <div className="flex items-center space-x-3">
                  <Check className="text-blue-500 w-5 h-5" />
                  <span>Quarterly reporting cycles</span>
                </div>
                <div className="flex items-center space-x-3">
                  <Check className="text-blue-500 w-5 h-5" />
                  <span>15+ investment professionals</span>
                </div>
              </div>
            </div>
            <div>
              <img 
                src="https://images.unsplash.com/photo-1560472354-b33ff0c44a43?ixlib=rb-4.0.3&w=600&h=400&fit=crop" 
                alt="Investment team meeting" 
                className="rounded-xl shadow-lg"
              />
            </div>
          </div>
        </div>
      </section>

      {/* The Challenge */}
      <section className="py-16 bg-gray-50">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-gray-900 mb-8 text-center">The Challenge</h2>
          <Card>
            <CardContent className="p-8">
              <p className="text-lg text-gray-600 mb-6">
                NextWorld Capital's investment team was spending an overwhelming amount of time manually processing 
                quarterly financial statements from their portfolio companies. Each quarter, they received hundreds 
                of documents in various formats containing critical financial metrics, KPIs, and performance data.
              </p>
              
              <h3 className="text-xl font-semibold text-gray-900 mb-4">Key Pain Points:</h3>
              <div className="space-y-4">
                <div className="flex items-start space-x-3">
                  <div className="w-2 h-2 bg-red-500 rounded-full mt-2"></div>
                  <p className="text-gray-600">Manual extraction of financial metrics from 200+ portfolio companies quarterly</p>
                </div>
                <div className="flex items-start space-x-3">
                  <div className="w-2 h-2 bg-red-500 rounded-full mt-2"></div>
                  <p className="text-gray-600">Inconsistent document formats from different companies</p>
                </div>
                <div className="flex items-start space-x-3">
                  <div className="w-2 h-2 bg-red-500 rounded-full mt-2"></div>
                  <p className="text-gray-600">Time-sensitive quarterly reporting deadlines</p>
                </div>
                <div className="flex items-start space-x-3">
                  <div className="w-2 h-2 bg-red-500 rounded-full mt-2"></div>
                  <p className="text-gray-600">Risk of human error in data transcription</p>
                </div>
                <div className="flex items-start space-x-3">
                  <div className="w-2 h-2 bg-red-500 rounded-full mt-2"></div>
                  <p className="text-gray-600">Limited scalability for growing portfolio</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* The Solution */}
      <section className="py-16">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-gray-900 mb-8 text-center">The Solution</h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div>
              <img 
                src="https://images.unsplash.com/photo-1551288049-bebda4e38f71?ixlib=rb-4.0.3&w=600&h=400&fit=crop" 
                alt="Data extraction dashboard" 
                className="rounded-xl shadow-lg"
              />
            </div>
            <div>
              <p className="text-lg text-gray-600 mb-6">
                NextWorld Capital implemented our PDF extraction platform to automate their quarterly 
                reporting workflow. The solution included custom extraction templates for financial 
                metrics and automated data validation.
              </p>
              
              <h3 className="text-xl font-semibold text-gray-900 mb-4">Implementation Features:</h3>
              <div className="space-y-3">
                <div className="flex items-center space-x-3">
                  <Check className="text-green-500 w-5 h-5" />
                  <span>Custom extraction templates for revenue, EBITDA, and growth metrics</span>
                </div>
                <div className="flex items-center space-x-3">
                  <Check className="text-green-500 w-5 h-5" />
                  <span>Automated classification of financial statement types</span>
                </div>
                <div className="flex items-center space-x-3">
                  <Check className="text-green-500 w-5 h-5" />
                  <span>Integration with existing portfolio management systems</span>
                </div>
                <div className="flex items-center space-x-3">
                  <Check className="text-green-500 w-5 h-5" />
                  <span>Quality assurance workflows for data validation</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Results */}
      <section className="py-16 bg-blue-50">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-gray-900 mb-8 text-center">Results & Impact</h2>
          
          <Card className="mb-8">
            <CardContent className="p-8">
              <blockquote className="text-xl text-gray-700 italic text-center mb-6">
                "Our team used to spend weeks manually extracting financial data from portfolio reports. 
                Now we process quarterly statements from 200+ companies in just hours with perfect accuracy. 
                This transformation has allowed our investment professionals to focus on what they do best: 
                identifying opportunities and supporting our portfolio companies."
              </blockquote>
              <div className="text-center">
                <p className="font-semibold text-gray-900">Sarah Chen</p>
                <p className="text-gray-600">Managing Director, NextWorld Capital</p>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <Card>
              <CardContent className="p-6">
                <h3 className="text-xl font-semibold text-gray-900 mb-4">Time Savings</h3>
                <ul className="space-y-2 text-gray-600">
                  <li>• Quarterly processing reduced from 3 weeks to 2 days</li>
                  <li>• Individual report processing: 2 hours → 5 minutes</li>
                  <li>• 95% reduction in manual data entry</li>
                  <li>• Freed up 400+ hours annually for strategic work</li>
                </ul>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <h3 className="text-xl font-semibold text-gray-900 mb-4">Quality Improvements</h3>
                <ul className="space-y-2 text-gray-600">
                  <li>• 99.8% accuracy in data extraction</li>
                  <li>• Eliminated transcription errors</li>
                  <li>• Standardized data formats across portfolio</li>
                  <li>• Real-time validation and error detection</li>
                </ul>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Call to Action */}
      <section className="py-16">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl font-bold text-gray-900 mb-6">Ready to transform your document processing?</h2>
          <p className="text-xl text-gray-600 mb-8">
            See how our PDF extraction platform can help your organization save time and improve accuracy.
          </p>
          <div className="space-x-4">
            <Button className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-3">
              Schedule a Demo
            </Button>
            <Link href="/demo">
              <Button variant="outline" className="px-8 py-3">
                Try It Now
              </Button>
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}