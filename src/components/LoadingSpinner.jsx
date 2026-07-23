import React from 'react'

const LoadingSpinner = ({ 
  size = 'md', 
  color = 'blue', 
  text = '', 
  variant = 'spinner',
  className = '' 
}) => {
  const sizeClasses = {
    'xs': 'w-3 h-3',
    'sm': 'w-4 h-4',
    'md': 'w-6 h-6',
    'lg': 'w-8 h-8',
    'xl': 'w-12 h-12'
  }

  const colorClasses = {
    'blue': 'text-blue-600',
    'green': 'text-green-600',
    'red': 'text-red-600',
    'yellow': 'text-yellow-600',
    'gray': 'text-gray-600',
    'white': 'text-white'
  }

  const renderSpinner = () => {
    switch (variant) {
      case 'dots':
        return (
          <div className="flex space-x-1">
            <div className={`${sizeClasses[size]} ${colorClasses[color]} animate-bounce rounded-full bg-current`} style={{ animationDelay: '0ms' }}></div>
            <div className={`${sizeClasses[size]} ${colorClasses[color]} animate-bounce rounded-full bg-current`} style={{ animationDelay: '150ms' }}></div>
            <div className={`${sizeClasses[size]} ${colorClasses[color]} animate-bounce rounded-full bg-current`} style={{ animationDelay: '300ms' }}></div>
          </div>
        )
      case 'pulse':
        return (
          <div className={`${sizeClasses[size]} ${colorClasses[color]} animate-pulse rounded-full bg-current`}></div>
        )
      case 'bars':
        return (
          <div className="flex space-x-1">
            <div className={`w-1 ${colorClasses[color]} bg-current animate-pulse`} style={{ animationDelay: '0ms', height: size === 'xs' ? '12px' : size === 'sm' ? '16px' : size === 'md' ? '24px' : size === 'lg' ? '32px' : '48px' }}></div>
            <div className={`w-1 ${colorClasses[color]} bg-current animate-pulse`} style={{ animationDelay: '150ms', height: size === 'xs' ? '12px' : size === 'sm' ? '16px' : size === 'md' ? '24px' : size === 'lg' ? '32px' : '48px' }}></div>
            <div className={`w-1 ${colorClasses[color]} bg-current animate-pulse`} style={{ animationDelay: '300ms', height: size === 'xs' ? '12px' : size === 'sm' ? '16px' : size === 'md' ? '24px' : size === 'lg' ? '32px' : '48px' }}></div>
          </div>
        )
      default:
        return (
          <div className={`${sizeClasses[size]} ${colorClasses[color]} animate-spin rounded-full border-2 border-gray-300 border-t-current`}></div>
        )
    }
  }

  return (
    <div className={`flex flex-col items-center justify-center ${className}`}>
      {renderSpinner()}
      {text && (
        <p className={`mt-2 text-sm ${colorClasses[color]} text-center max-w-xs`}>
          {text}
        </p>
      )}
    </div>
  )
}

export default LoadingSpinner 