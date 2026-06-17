import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import HomePage from './pages/HomePage'
import NewBriefPage from './pages/NewBriefPage'
import BriefEditPage from './pages/BriefEditPage'
import BriefsListPage from './pages/BriefsListPage'
import BrandsListPage from './pages/BrandsListPage'
import BrandNewPage from './pages/BrandNewPage'
import BrandEditPage from './pages/BrandEditPage'
import './styles/global.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/briefs" element={<BriefsListPage />} />
          <Route path="/brief/new" element={<NewBriefPage />} />
          <Route path="/brief/:id" element={<BriefEditPage />} />
          <Route path="/brands" element={<BrandsListPage />} />
          <Route path="/brands/new" element={<BrandNewPage />} />
          <Route path="/brands/:id" element={<BrandEditPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)
