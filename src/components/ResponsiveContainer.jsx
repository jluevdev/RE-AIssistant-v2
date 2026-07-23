import React from 'react'

const ResponsiveContainer = ({ 
  children, 
  className = '', 
  padding = true,
  maxWidth = '7xl',
  bottomPadding = true,
  mobilePadding = 'px-3',
  tabletPadding = 'px-4 sm:px-6',
  desktopPadding = 'lg:px-8'
}) => {
  const maxWidthClasses = {
    'sm': 'max-w-sm',
    'md': 'max-w-md',
    'lg': 'max-w-lg',
    'xl': 'max-w-xl',
    '2xl': 'max-w-2xl',
    '3xl': 'max-w-3xl',
    '4xl': 'max-w-4xl',
    '5xl': 'max-w-5xl',
    '6xl': 'max-w-6xl',
    '7xl': 'max-w-7xl',
    'full': 'max-w-full'
  }

  const paddingClasses = padding ? `${mobilePadding} ${tabletPadding} ${desktopPadding}` : ''
  const bottomPaddingClass = bottomPadding ? 'pb-20 lg:pb-6' : ''

  return (
    <div className={`
      mx-auto ${maxWidthClasses[maxWidth]} 
      ${paddingClasses} 
      ${bottomPaddingClass}
      ${className}
    `}>
      {children}
    </div>
  )
}

export default ResponsiveContainer 