import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Atom, Menu, X } from 'lucide-react';

export const LandingHeader: React.FC = () => {
  const navigate = useNavigate();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  return (
    <header className="bg-white/80 backdrop-blur-sm border-b border-gray-200/50 px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between sticky top-0 z-50">
      <div className="flex items-center space-x-2">
        <Atom className="w-6 h-6 sm:w-8 sm:h-8 text-blue-600" />
        <h1 className="text-lg sm:text-xl font-bold text-gray-900">NovoProtein AI</h1>
      </div>
      
      {/* Desktop Navigation */}
      <nav className="hidden md:flex items-center space-x-4 lg:space-x-6">
        <Link 
          to="/pricing" 
          className="text-gray-700 hover:text-gray-900 transition-colors text-sm font-medium"
        >
          Pricing
        </Link>
        <Link 
          to="/signin" 
          className="text-gray-700 hover:text-gray-900 transition-colors text-sm font-medium"
        >
          Sign in
        </Link>
        <button
          onClick={() => navigate('/signup')}
          className="bg-black text-white px-3 lg:px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-800 transition-colors"
        >
          Get started
        </button>
      </nav>

      {/* Mobile Menu Button */}
      <button
        onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
        className="md:hidden p-2 text-gray-700 hover:text-gray-900 hover:bg-gray-100 rounded transition-colors"
        aria-label="Toggle menu"
      >
        {isMobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
      </button>

      {/* Mobile Menu Dropdown */}
      {isMobileMenuOpen && (
        <>
          <div 
            className="fixed inset-0 bg-black bg-opacity-50 z-40 md:hidden top-[57px] sm:top-[65px]"
            onClick={() => setIsMobileMenuOpen(false)}
          />
          <div className="absolute top-full left-0 right-0 bg-white border-b border-gray-200/50 shadow-lg z-50 md:hidden">
            <nav className="px-4 py-4 space-y-3">
              <Link 
                to="/pricing" 
                onClick={() => setIsMobileMenuOpen(false)}
                className="block text-gray-700 hover:text-gray-900 transition-colors text-sm font-medium py-2"
              >
                Pricing
              </Link>
              <Link 
                to="/signin" 
                onClick={() => setIsMobileMenuOpen(false)}
                className="block text-gray-700 hover:text-gray-900 transition-colors text-sm font-medium py-2"
              >
                Sign in
              </Link>
              <button
                onClick={() => {
                  navigate('/signup');
                  setIsMobileMenuOpen(false);
                }}
                className="w-full bg-black text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-800 transition-colors"
              >
                Get started
              </button>
            </nav>
          </div>
        </>
      )}
    </header>
  );
};

