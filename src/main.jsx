import React from 'react'
import ReactDOM from 'react-dom/client'
import DeploymentErrorScreen from '@/components/DeploymentErrorScreen.jsx'
import { validatePublicRuntimeConfig } from '@/lib/publicRuntimeConfig.js'
import '@/index.css'

const root = ReactDOM.createRoot(document.getElementById('root'))
const runtimeConfig = validatePublicRuntimeConfig({
  VITE_SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL,
  VITE_SUPABASE_PUBLISHABLE_KEY: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
})

if (!runtimeConfig.isValid) {
  const details = [
    ...runtimeConfig.missingVariables.map((name) => `${name} is missing.`),
    ...runtimeConfig.errors,
  ]

  console.error('HC Apparel deployment configuration is incomplete.', {
    missingVariables: runtimeConfig.missingVariables,
    errors: runtimeConfig.errors,
  })

  root.render(
    <DeploymentErrorScreen
      title="Storefront configuration needed"
      message="The storefront cannot connect to its backend yet. No customer or order data has been changed."
      details={details}
    />,
  )
} else {
  import('@/App.jsx')
    .then(({ default: App }) => {
      root.render(<App />)
    })
    .catch((error) => {
      console.error('HC Apparel failed to start.', error)
      root.render(
        <DeploymentErrorScreen
          message="The storefront encountered a startup error. Please refresh or try again shortly."
        />,
      )
    })
}
