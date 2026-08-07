/*
 * generated-by: @solderlab/bsc (c)
 * board: glasgow
 * source-revision: 06201dd31888e1af3ebefaaf6dc8b1d2babbbca9
 * bsc-schema-version: 1.0
 * source-sha256: e582ed0cc7eb0f6e7795cb5c9253ce748d7d47a8b56267382507108323697b5b
 * DO NOT EDIT
 */

#pragma once

#ifndef SOLDERLAB_BSC_VERSION
#define SOLDERLAB_BSC_VERSION "1.0"
#endif

/* Board: glasgow */

/* ---- MCU pins (pad number) ---- */
#define SOLDERLAB_PIN_RDY0_SLRD 1 /* Net-(U1-Pad1) */
#define SOLDERLAB_PIN_RDY1_SLWR 2 /* Net-(U1-Pad2) */
#define SOLDERLAB_PIN_AVCC 3 /* Net-(U1-Pad11) */
#define SOLDERLAB_PIN_XTALOUT 4 /* Net-(U1-Pad4) */
#define SOLDERLAB_PIN_XTALIN 5 /* Net-(U1-Pad5) */
#define SOLDERLAB_PIN_AGND 6 /* Net-(U1-Pad10) */
#define SOLDERLAB_PIN_AVCC_7 7 /* Net-(U1-Pad11) */
#define SOLDERLAB_PIN_D 8 /* ~{CY_RESET} */
#define SOLDERLAB_PIN_D_9 9 /* Net-(U1-Pad9) */
#define SOLDERLAB_PIN_AGND_10 10 /* Net-(U1-Pad10) */
#define SOLDERLAB_PIN_VCC 11 /* Net-(U1-Pad11) */
#define SOLDERLAB_PIN_GND 12 /* Net-(U1-Pad10) */
#define SOLDERLAB_PIN_IFCLK 13 /* Net-(U1-Pad13) */
#define SOLDERLAB_PIN_RESERVED 14 /* Net-(U1-Pad14) */
#define SOLDERLAB_PIN_SCL 15 /* Net-(U1-Pad15) */
#define SOLDERLAB_PIN_SDA 16 /* Net-(U1-Pad16) */
#define SOLDERLAB_PIN_VCC_17 17 /* Net-(U1-Pad11) */
#define SOLDERLAB_PIN_PB0_FD0 18 /* Net-(U1-Pad18) */
#define SOLDERLAB_PIN_PB1_FD1 19 /* Net-(U1-Pad19) */
#define SOLDERLAB_PIN_PB2_FD2 20 /* Net-(U1-Pad20) */
#define SOLDERLAB_PIN_PB3_FD3 21 /* Net-(U1-Pad21) */
#define SOLDERLAB_PIN_PB4_FD4 22 /* Net-(U1-Pad22) */
#define SOLDERLAB_PIN_PB5_FD5 23 /* Net-(U1-Pad23) */
#define SOLDERLAB_PIN_PB6_FD6 24 /* FPGA_DONE */
#define SOLDERLAB_PIN_PB7_FD7 25 /* Net-(U1-Pad25) */
#define SOLDERLAB_PIN_GND_26 26 /* Net-(U1-Pad10) */
#define SOLDERLAB_PIN_VCC_27 27 /* Net-(U1-Pad11) */
#define SOLDERLAB_PIN_GND_28 28 /* Net-(U1-Pad10) */
#define SOLDERLAB_PIN_CTL0_FLAGA 29 /* LED_ERR */
#define SOLDERLAB_PIN_CTL1_FLAGB 30 /* LED_ACT */
#define SOLDERLAB_PIN_CTL2_FLAGC 31 /* LED_FPGA */
#define SOLDERLAB_PIN_VCC_32 32 /* Net-(U1-Pad11) */
#define SOLDERLAB_PIN_PA0_INT0 33 /* Net-(U1-Pad33) */
#define SOLDERLAB_PIN_PA1_INT1 34 /* ENVA */
#define SOLDERLAB_PIN_PA2_SLOE 35 /* Net-(U1-Pad35) */
#define SOLDERLAB_PIN_PA3_WU2 36 /* Net-(U1-Pad36) */
#define SOLDERLAB_PIN_PA4_FIOADDR0 37 /* Net-(U1-Pad37) */
#define SOLDERLAB_PIN_PA5_FIOADDR1 38 /* Net-(U1-Pad38) */
#define SOLDERLAB_PIN_PA6_PKTEND 39 /* Net-(U1-Pad39) */
#define SOLDERLAB_PIN_PA7_FLAGD_SLCS 40 /* Net-(U1-Pad40) */
#define SOLDERLAB_PIN_GND_41 41 /* Net-(U1-Pad10) */
#define SOLDERLAB_PIN_RESET 42 /* Net-(U1-Pad42) */
#define SOLDERLAB_PIN_VCC_43 43 /* Net-(U1-Pad11) */
#define SOLDERLAB_PIN_WAKEUP 44 /* Net-(U1-Pad44) */
#define SOLDERLAB_PIN_PD0_FD8 45 /* ~{FPGA_RESET} */
#define SOLDERLAB_PIN_PD1_FD9 46 /* ~{ALERT} */
#define SOLDERLAB_PIN_PD2_FD10 47 /* Net-(U1-Pad47) */
#define SOLDERLAB_PIN_PD3_FD11 48 /* Net-(U1-Pad48) */
#define SOLDERLAB_PIN_PD4_FD12 49 /* Net-(U1-Pad49) */
#define SOLDERLAB_PIN_PD5_FD13 50 /* Net-(U1-Pad50) */
#define SOLDERLAB_PIN_PD6_FD14 51 /* Net-(U1-Pad51) */
#define SOLDERLAB_PIN_PD7_FD15 52 /* Net-(U1-Pad52) */
#define SOLDERLAB_PIN_GND_53 53 /* Net-(U1-Pad10) */
#define SOLDERLAB_PIN_CLKOUT 54 /* Net-(U1-Pad54) */
#define SOLDERLAB_PIN_VCC_55 55 /* Net-(U1-Pad11) */
#define SOLDERLAB_PIN_GND_56 56 /* Net-(U1-Pad10) */
#define SOLDERLAB_PIN_EP 57 /* Net-(U1-Pad57) */

/* ---- Power rails (millivolts when known) ---- */
/* SOLDERLAB_RAIL_GNDPLL0_MV — voltage unknown for GNDPLL0 */
/* SOLDERLAB_RAIL_GNDPLL1_MV — voltage unknown for GNDPLL1 */
/* SOLDERLAB_RAIL_VCCPLL0_MV — voltage unknown for VCCPLL0 */
/* SOLDERLAB_RAIL_VCCPLL1_MV — voltage unknown for VCCPLL1 */

/* ---- I2C addresses (only when known) ---- */
/* SOLDERLAB_I2C_U2_ADDR — address unknown for U2 */
/* SOLDERLAB_I2C_U3_ADDR — address unknown for U3 */
/* SOLDERLAB_I2C_U12_ADDR — address unknown for U12 */
/* SOLDERLAB_I2C_U13_ADDR — address unknown for U13 */
/* SOLDERLAB_I2C_U20_ADDR — address unknown for U20 */
/* SOLDERLAB_I2C_U21_ADDR — address unknown for U21 */
