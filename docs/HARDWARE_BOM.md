# Bill of Materials (BOM) - Diagnostic Sensing Devices

**Version:** 1.0
**Date:** 2026-10-12
**Purpose:** Low-cost diagnostic sensing devices for vocational training (leak detection & welding hazard sensing)

---

## Device Configurations

### Configuration 1: Handheld Leak Detection Device

**Use Case:** Water/gas leak detection in pipe networks
**Target Cost:** ₹2,500 - ₹3,500 per unit

| Component | Specification | Qty | Unit Cost (₹) | Total (₹) | Supplier Notes |
|-----------|---------------|-----|---------------|-----------|----------------|
| **Microcontroller** | ESP32-S3 (WiFi + BLE) | 1 | 350 | 350 | Espressif/Chinese imports |
| **Acoustic Sensor** | MEMS Microphone (SPH0645) | 1 | 150 | 150 | High sensitivity for ultrasonic leak detection |
| **Pressure Sensor** | BMP280 (10-1200 hPa) | 1 | 200 | 200 | For water/gas pressure monitoring |
| **Gas Sensor** | MQ-5 (LPG/Propane) or MQ-2 (General gas) | 1 | 180 | 180 | Depends on target gas type |
| **Display** | 0.96" OLED (I2C) | 1 | 250 | 250 | 128x64 for status/alert display |
| **Battery** | Li-ion 2000mAh | 1 | 350 | 350 | 3.7V with protection circuit |
| **Charging Module** | TP4056 USB-C | 1 | 50 | 50 | Micro USB or USB-C |
| **Vibration Motor** | 1030 type | 1 | 40 | 40 | Haptic feedback for alerts |
| **Buzzer** | 5V Piezo buzzer | 1 | 30 | 30 | Audio alerts |
| **LEDs** | RGB LED (WS2812) | 1 | 50 | 50 | Visual status indication |
| **Enclosure** | 3D printed PLA case | 1 | 150 | 150 | Or injection molded for bulk |
| **PCB** | Custom PCB (2-layer) | 1 | 200 | 200 | Local fabrication |
| **Connectors** | Molex/FPC | 1 set | 100 | 100 | For sensor connections |
| **Miscellaneous** | Wire, solder, standoffs | 1 | 150 | 150 | - |
| **Assembly & Testing** | Labor + QA | 1 | 300 | 300 | Local assembly |
| **TOTAL** | | | | **2,450** | |

**Alternative Cost-Saving Options:**
- Use ESP8266 instead of ESP32-S3: Save ₹100
- Remove OLED display: Save ₹250 (use LEDs only)
- Use 1500mAh battery: Save ₹100
- **Minimum viable cost:** ₹2,000

---

### Configuration 2: Wearable Welding Hazard Monitor

**Use Case:** Real-time proximity and exposure alerts for welding/gas-cutting
**Target Cost:** ₹3,000 - ₹4,000 per unit

| Component | Specification | Qty | Unit Cost (₹) | Total (₹) | Supplier Notes |
|-----------|---------------|-----|---------------|-----------|----------------|
| **Microcontroller** | ESP32-S3 (WiFi + BLE) | 1 | 350 | 350 | Dual-core for sensor fusion |
| **UV Sensor** | VEML6075 (UVA/UVB) | 1 | 400 | 400 | For welding arc UV exposure |
| **Temperature Sensor** | MLX90614 (Non-contact IR) | 1 | 450 | 450 | Heat proximity detection |
| **Gas Sensor** | MQ-7 (CO) + MQ-9 (LPG) | 2 | 360 | 720 | For welding gas monitoring |
| **Accelerometer** | MPU6050 (6-axis IMU) | 1 | 200 | 200 | Motion/proximity detection |
| **Haptic Motor** | 10mm Linear Vibration | 2 | 80 | 160 | Dual motors for directional alerts |
| **Battery** | Li-ion 3000mAh | 1 | 450 | 450 | Extended runtime for full-day use |
| **Charging Module** | TP4056 USB-C | 1 | 50 | 50 | - |
| **LED Indicator** | Neopixel RGB strip (5 LEDs) | 1 | 120 | 120 | Belt-mounted visual alert |
| **Audio Alert** | Small speaker + amplifier | 1 | 150 | 150 | Directional audio cues |
| **Wearable Enclosure** | Silicone strap + IP65 case | 1 | 400 | 400 | Wrist/arm mountable |
| **PCB** | Custom PCB (4-layer) | 1 | 300 | 300 | Better signal integrity |
| **Connectors** | Waterproof IP67 | 1 set | 200 | 200 | For outdoor use |
| **Miscellaneous** | Straps, clips, foam | 1 | 200 | 200 | Comfort/accessories |
| **Assembly & Testing** | Labor + QA | 1 | 400 | 400 | Waterproof testing required |
| **TOTAL** | | | | **4,270** | |

**Alternative Cost-Saving Options:**
- Use simpler UV sensor (GUVA-S12SD): Save ₹250
- Use single gas sensor: Save ₹360
- Use 2000mAh battery: Save ₹150
- **Minimum viable cost:** ₹3,500

---

### Configuration 3: Fixed Multi-Sensor Station

**Use Case:** Training centre fixed installation for comprehensive monitoring
**Target Cost:** ₹8,000 - ₹12,000 per unit

| Component | Specification | Qty | Unit Cost (₹) | Total (₹) | Supplier Notes |
|-----------|---------------|-----|---------------|-----------|----------------|
| **Microcontroller** | Raspberry Pi 4 (2GB) | 1 | 3,500 | 3,500 | Local processing + video |
| **Camera Module** | Pi Camera (1080p) | 1 | 1,200 | 1,200 | Visual documentation |
| **Acoustic Array** | 4x MEMS microphones | 4 | 150 | 600 | Directional leak detection |
| **Gas Sensors** | MQ series array (4 types) | 4 | 180 | 720 | Multi-gas detection |
| **Pressure Sensors** | Multiple ports | 4 | 200 | 800 | Pipe network monitoring |
| **Temperature** | DS18B20 (4 sensors) | 4 | 80 | 320 | Multi-point temp |
| **UV Sensor** | VEML6075 | 1 | 400 | 400 | Welding area monitoring |
| **Display** | 7" Touchscreen HDMI | 1 | 2,500 | 2,500 | Trainer interface |
| **Power Supply** | 5V 3A + 12V 2A | 1 | 600 | 600 | Dual rail |
| **Enclosure** | Industrial IP65 | 1 | 1,500 | 1,500 | Weatherproof mounting |
| **Mounting Hardware** | Brackets, cables | 1 | 500 | 500 | - |
| **Assembly & Software** | Labor + setup | 1 | 1,000 | 1,000 | Custom software |
| **TOTAL** | | | | **12,640** | |

---

## Bulk Procurement Estimates

### For 50 Training Centres (1 device per centre)

| Device Type | Units | Unit Cost | Total Cost | Notes |
|-------------|-------|-----------|------------|-------|
| Handheld Leak Detector | 50 | ₹2,500 | ₹125,000 | Basic configuration |
| Wearable Welding Monitor | 50 | ₹3,500 | ₹175,000 | Basic configuration |
| **Subtotal** | 100 | - | **₹300,000** | |

### For 200 Training Centres (Economies of scale)

| Device Type | Units | Unit Cost | Total Cost | Notes |
|-------------|-------|-----------|------------|-------|
| Handheld Leak Detector | 200 | ₹2,200 | ₹440,000 | 12% volume discount |
| Wearable Welding Monitor | 200 | ₹3,100 | ₹620,000 | 11% volume discount |
| **Subtotal** | 400 | - | **₹1,060,000** | |

### For 500 Training Centres (National rollout)

| Device Type | Units | Unit Cost | Total Cost | Notes |
|-------------|-------|-----------|------------|-------|
| Handheld Leak Detector | 500 | ₹1,900 | ₹950,000 | 24% volume discount |
| Wearable Welding Monitor | 500 | ₹2,700 | ₹1,350,000 | 23% volume discount |
| Fixed Multi-Sensor Station | 50 | ₹10,000 | ₹500,000 | For large centres |
| **Subtotal** | 1,050 | - | **₹2,800,000** | |

---

## Local Sourcing Strategy

### Recommended Indian Suppliers

1. **Components:**
   - Robokits India (www.robokits.co.in)
   - ElectronicsComp (www.electronicscomp.com)
   - Amazon India (verified sellers)
   - Local electronics markets (Lamington Road - Mumbai, SP Road - Bangalore)

2. **PCB Fabrication:**
   - PCBWay India
   - JLCPCB (with India shipping)
   - Local prototype houses

3. **Enclosure Manufacturing:**
   - 3D printing services (local makerspaces)
   - Injection molding for 100+ units
   - CNC machining for industrial cases

4. **Assembly:**
   - Local electronics assembly shops
   - ITI vocational students (skills training partnership)
   - Vendor in Delhi NCR, Bangalore, or Pune

---

## Maintenance & Spares Budget

### Annual Maintenance (per 100 devices)

| Item | Cost (₹) | Notes |
|------|----------|-------|
| Battery replacements (20%) | 20,000 | 2-year battery life |
| Sensor recalibration | 10,000 | Annual calibration service |
| Spare parts kit | 15,000 | PCBs, sensors, connectors |
| Firmware updates | 5,000 | OTA update infrastructure |
| **Annual Total** | **50,000** | ₹500 per device/year |

---

## Safety Validation Testing Budget

| Activity | Cost (₹) | Notes |
|----------|----------|-------|
| NABL-certified lab testing | 50,000 | Sensor accuracy validation |
| Field trials (3 centres) | 30,000 | Real-world testing |
| Occupational safety audit | 20,000 | OSHA/BIS compliance check |
| Certification fees | 25,000 | If formal certification required |
| **Total** | **125,000** | One-time setup |

---

## Total Project Cost Estimate

### For Pilot Deployment (50 training centres)

| Category | Cost (₹) |
|----------|----------|
| Device procurement (100 units) | 300,000 |
| Safety validation testing | 125,000 |
| Training & documentation | 50,000 |
| Logistics & distribution | 25,000 |
| **Pilot Total** | **500,000** |

### For National Rollout (500 training centres)

| Category | Cost (₹) |
|----------|----------|
| Device procurement (1,050 units) | 2,800,000 |
| Annual maintenance (year 1) | 50,000 |
| Training of trainers | 100,000 |
| Documentation & NSQF integration | 75,000 |
| **Rollout Total** | **3,025,000** |

---

## Cost Optimization Recommendations

1. **Standardize Components:** Use same ESP32 across all devices for bulk pricing
2. **Open-Source Hardware:** Release designs to enable local manufacturing
3. **Modular Design:** Sensors on plug-in modules for easy replacement
4. **ITI Partnership:** Have ITI students assemble as part of training
5. **Local Fabrication:** PCB and enclosure fabrication in India to reduce import costs
6. **Software Over Hardware:** Implement smart algorithms to reduce sensor requirements

---

## Next Steps

1. **Prototype Phase:** Build 5 units of each configuration for field testing
2. **Cost Validation:** Verify actual BOM costs with local suppliers
3. **Pilot Procurement:** Order 50 units for pilot deployment
4. **Feedback Loop:** Gather user feedback to refine design
5. **Scale-Up:** Move to volume manufacturing for national rollout
