import { Routes, Route } from 'react-router-dom'
import { useState } from 'react'
import Landing from './pages/Landing'
import Swap from './pages/Swap'
import PoolPage from './pages/Pool'
import DarkPool from './pages/DarkPool'
import Orders from './pages/Orders'
import Portfolio from './pages/Portfolio'
import Analytics from './pages/Analytics'
import Faucet from './pages/Faucet'
import AppShell from './components/layout/AppShell'
import { WalletProvider } from './context/WalletContext'

export default function App() {
  return (
    <WalletProvider>
      <div className="noise-overlay" />
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route element={<AppShell />}>
          <Route path="/swap" element={<Swap />} />
          <Route path="/pool" element={<PoolPage />} />
          <Route path="/darkpool" element={<DarkPool />} />
          <Route path="/orders" element={<Orders />} />
          <Route path="/portfolio" element={<Portfolio />} />
          <Route path="/analytics" element={<Analytics />} />
          <Route path="/faucet" element={<Faucet />} />
        </Route>
      </Routes>
    </WalletProvider>
  )
}
