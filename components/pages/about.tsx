import { Card, CardContent } from "@/components/ui/card";
import { Users, Target, Award, CheckCircle } from "lucide-react";

export default function About() {
  return (
    <div className="min-h-screen py-20">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Hero Section */}
        <div className="text-center mb-16">
          <h1 className="text-5xl font-bold text-gray-900 mb-6">About CPAAutomation</h1>
          <p className="text-xl text-gray-600 mb-8">
            True GenAI customizable extraction programmed by real CPAs and lawyers for practical professional use
          </p>
        </div>

        {/* Mission Section */}
        <section className="mb-16">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="text-3xl font-bold text-gray-900 mb-6">Our Mission</h2>
              <p className="text-lg text-gray-600 mb-6">
                CPAAutomation was created to bridge the gap between traditional document processing and modern AI capabilities. 
                We understand that financial and legal professionals need extraction tools that truly comprehend the nuances of their documents.
              </p>
              <p className="text-lg text-gray-600">
                Our platform combines deep domain expertise from certified professionals with cutting-edge AI technology to deliver 
                extraction accuracy that meets the rigorous standards of accounting and legal workflows.
              </p>
            </div>
            <div className="flex justify-center">
              <div className="bg-blue-100 w-64 h-64 rounded-lg flex items-center justify-center">
                <Target className="w-32 h-32 text-blue-600" />
              </div>
            </div>
          </div>
        </section>

        {/* Team Section */}
        <section className="mb-16">
          <h2 className="text-3xl font-bold text-gray-900 text-center mb-12">Built by Professionals, for Professionals</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <Card>
              <CardContent className="p-8 text-center">
                <div className="bg-green-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6">
                  <Award className="w-8 h-8 text-green-600" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-4">CPA Expertise</h3>
                <p className="text-gray-600">
                  Our extraction algorithms are developed and validated by certified public accountants who understand 
                  the complexities of financial document processing and compliance requirements.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-8 text-center">
                <div className="bg-purple-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6">
                  <Users className="w-8 h-8 text-purple-600" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-4">Legal Validation</h3>
                <p className="text-gray-600">
                  Licensed attorneys contribute to our extraction rule development, ensuring that our AI understands 
                  legal document structures and meets professional standards for data accuracy.
                </p>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* Values Section */}
        <section className="mb-16">
          <h2 className="text-3xl font-bold text-gray-900 text-center mb-12">Our Values</h2>
          <div className="space-y-6">
            <div className="flex items-start space-x-4">
              <CheckCircle className="w-6 h-6 text-green-500 mt-1 flex-shrink-0" />
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Professional Accuracy</h3>
                <p className="text-gray-600">
                  Every extraction rule is designed and tested by professionals who use these documents daily in their practice.
                </p>
              </div>
            </div>
            
            <div className="flex items-start space-x-4">
              <CheckCircle className="w-6 h-6 text-green-500 mt-1 flex-shrink-0" />
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Data Security</h3>
                <p className="text-gray-600">
                  We prioritize your data security with immediate file deletion post-processing and US-only server hosting.
                </p>
              </div>
            </div>
            
            <div className="flex items-start space-x-4">
              <CheckCircle className="w-6 h-6 text-green-500 mt-1 flex-shrink-0" />
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Customizable Flexibility</h3>
                <p className="text-gray-600">
                  While our base rules are professionally designed, users can create custom prompts for maximum flexibility.
                </p>
              </div>
            </div>
            
            <div className="flex items-start space-x-4">
              <CheckCircle className="w-6 h-6 text-green-500 mt-1 flex-shrink-0" />
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Enterprise Ready</h3>
                <p className="text-gray-600">
                  Built to scale with dedicated US-based support and custom integrations for enterprise workflows.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Contact CTA */}
        <section className="text-center bg-gray-50 rounded-lg p-12">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Questions About Our Platform?</h2>
          <p className="text-lg text-gray-600 mb-6">
            Connect with our team to learn more about how CPAAutomation can transform your document processing workflow.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <a href="/contact" className="bg-green-500 hover:bg-green-600 text-white px-6 py-3 rounded-lg font-medium transition-colors">
              Contact Us
            </a>
            <a href="/demo" className="border border-gray-300 hover:border-gray-400 text-gray-700 px-6 py-3 rounded-lg font-medium transition-colors">
              View Demo
            </a>
          </div>
        </section>
      </div>
    </div>
  );
}