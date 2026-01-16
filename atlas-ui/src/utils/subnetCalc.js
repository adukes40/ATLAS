/**
 * Subnet Calculator Utilities
 * Pure JavaScript functions for IP/subnet calculations
 */

/**
 * Convert IP string to 32-bit integer
 */
export function ipToInt(ip) {
  const parts = ip.split('.').map(Number)
  if (parts.length !== 4 || parts.some(p => isNaN(p) || p < 0 || p > 255)) {
    return null
  }
  return (parts[0] << 24) + (parts[1] << 16) + (parts[2] << 8) + parts[3] >>> 0
}

/**
 * Convert 32-bit integer to IP string
 */
export function intToIp(int) {
  return [
    (int >>> 24) & 255,
    (int >>> 16) & 255,
    (int >>> 8) & 255,
    int & 255
  ].join('.')
}

/**
 * Convert CIDR prefix to subnet mask integer
 */
export function cidrToMaskInt(cidr) {
  if (cidr < 0 || cidr > 32) return null
  return cidr === 0 ? 0 : (0xFFFFFFFF << (32 - cidr)) >>> 0
}

/**
 * Convert CIDR prefix to subnet mask string
 */
export function cidrToMask(cidr) {
  const maskInt = cidrToMaskInt(cidr)
  return maskInt !== null ? intToIp(maskInt) : null
}

/**
 * Convert subnet mask string to CIDR prefix
 */
export function maskToCidr(mask) {
  const maskInt = ipToInt(mask)
  if (maskInt === null) return null

  let cidr = 0
  let temp = maskInt
  while (temp & 0x80000000) {
    cidr++
    temp = (temp << 1) >>> 0
  }

  // Verify it's a valid subnet mask (contiguous 1s)
  if (cidrToMaskInt(cidr) !== maskInt) return null
  return cidr
}

/**
 * Calculate wildcard mask from subnet mask
 */
export function getWildcardMask(maskInt) {
  return (~maskInt) >>> 0
}

/**
 * Calculate network address
 */
export function getNetworkAddress(ipInt, maskInt) {
  return (ipInt & maskInt) >>> 0
}

/**
 * Calculate broadcast address
 */
export function getBroadcastAddress(networkInt, maskInt) {
  return (networkInt | (~maskInt >>> 0)) >>> 0
}

/**
 * Get total number of hosts in subnet
 */
export function getTotalHosts(cidr) {
  return Math.pow(2, 32 - cidr)
}

/**
 * Get number of usable hosts (excludes network and broadcast)
 */
export function getUsableHosts(cidr) {
  if (cidr >= 31) return cidr === 31 ? 2 : 1 // /31 and /32 special cases
  return Math.pow(2, 32 - cidr) - 2
}

/**
 * Get first usable host IP
 */
export function getFirstUsableHost(networkInt, cidr) {
  if (cidr >= 31) return networkInt
  return networkInt + 1
}

/**
 * Get last usable host IP
 */
export function getLastUsableHost(broadcastInt, cidr) {
  if (cidr >= 31) return broadcastInt
  return broadcastInt - 1
}

/**
 * Determine IP class (A, B, C, D, E)
 */
export function getIpClass(ipInt) {
  const firstOctet = (ipInt >>> 24) & 255
  if (firstOctet < 128) return 'A'
  if (firstOctet < 192) return 'B'
  if (firstOctet < 224) return 'C'
  if (firstOctet < 240) return 'D (Multicast)'
  return 'E (Reserved)'
}

/**
 * Determine if IP is private (RFC 1918) or public
 */
export function getIpType(ipInt) {
  const firstOctet = (ipInt >>> 24) & 255
  const secondOctet = (ipInt >>> 16) & 255

  // 10.0.0.0/8
  if (firstOctet === 10) return 'Private (10.0.0.0/8)'

  // 172.16.0.0/12
  if (firstOctet === 172 && secondOctet >= 16 && secondOctet <= 31) {
    return 'Private (172.16.0.0/12)'
  }

  // 192.168.0.0/16
  if (firstOctet === 192 && secondOctet === 168) {
    return 'Private (192.168.0.0/16)'
  }

  // 127.0.0.0/8 (loopback)
  if (firstOctet === 127) return 'Loopback (127.0.0.0/8)'

  // 169.254.0.0/16 (link-local)
  if (firstOctet === 169 && secondOctet === 254) {
    return 'Link-Local (169.254.0.0/16)'
  }

  return 'Public'
}

/**
 * Check if an IP is within a subnet
 */
export function isIpInSubnet(testIpInt, networkInt, maskInt) {
  return (testIpInt & maskInt) === networkInt
}

/**
 * Validate IP address string
 */
export function isValidIp(ip) {
  return ipToInt(ip) !== null
}

/**
 * Validate CIDR notation (e.g., "192.168.1.0/24")
 */
export function parseCidrNotation(cidrStr) {
  const match = cidrStr.match(/^(\d+\.\d+\.\d+\.\d+)\/(\d+)$/)
  if (!match) return null

  const ip = match[1]
  const cidr = parseInt(match[2], 10)

  if (!isValidIp(ip) || cidr < 0 || cidr > 32) return null

  return { ip, cidr }
}

/**
 * Full subnet calculation
 */
export function calculateSubnet(ip, cidr) {
  const ipInt = ipToInt(ip)
  if (ipInt === null || cidr < 0 || cidr > 32) return null

  const maskInt = cidrToMaskInt(cidr)
  const networkInt = getNetworkAddress(ipInt, maskInt)
  const broadcastInt = getBroadcastAddress(networkInt, maskInt)

  return {
    inputIp: ip,
    cidr,
    networkAddress: intToIp(networkInt),
    broadcastAddress: intToIp(broadcastInt),
    subnetMask: cidrToMask(cidr),
    wildcardMask: intToIp(getWildcardMask(maskInt)),
    firstUsableHost: intToIp(getFirstUsableHost(networkInt, cidr)),
    lastUsableHost: intToIp(getLastUsableHost(broadcastInt, cidr)),
    totalHosts: getTotalHosts(cidr),
    usableHosts: getUsableHosts(cidr),
    ipClass: getIpClass(ipInt),
    ipType: getIpType(ipInt),
    // Keep integers for IP-in-subnet checks
    _networkInt: networkInt,
    _maskInt: maskInt
  }
}
