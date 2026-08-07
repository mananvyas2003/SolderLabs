// * generated-by: @solderlab/bsc (rust)
// * board: glasgow
// * source-revision: 06201dd31888e1af3ebefaaf6dc8b1d2babbbca9
// * bsc-schema-version: 1.0
// * source-sha256: e582ed0cc7eb0f6e7795cb5c9253ce748d7d47a8b56267382507108323697b5b
// * DO NOT EDIT

//! Board Support Contract — glasgow
#![allow(non_upper_case_globals)]

pub const SOLDERLAB_BSC_VERSION: &str = "1.0";
pub const BOARD_NAME: &str = "glasgow";

pub mod mcu {
    pub const REFDES: &str = "U1";
    pub const MPN: &str = "CY7C68013A-56LTXC";
}

pub mod pins {
    /// U1 pad 1 → Net-(U1-Pad1)
    pub const RDY0_SLRD: u16 = 1;
    /// U1 pad 2 → Net-(U1-Pad2)
    pub const RDY1_SLWR: u16 = 2;
    /// U1 pad 3 → Net-(U1-Pad11)
    pub const AVCC: u16 = 3;
    /// U1 pad 4 → Net-(U1-Pad4)
    pub const XTALOUT: u16 = 4;
    /// U1 pad 5 → Net-(U1-Pad5)
    pub const XTALIN: u16 = 5;
    /// U1 pad 6 → Net-(U1-Pad10)
    pub const AGND: u16 = 6;
    /// U1 pad 7 → Net-(U1-Pad11)
    pub const AVCC_7: u16 = 7;
    /// U1 pad 8 → ~{CY_RESET}
    pub const D: u16 = 8;
    /// U1 pad 9 → Net-(U1-Pad9)
    pub const D_9: u16 = 9;
    /// U1 pad 10 → Net-(U1-Pad10)
    pub const AGND_10: u16 = 10;
    /// U1 pad 11 → Net-(U1-Pad11)
    pub const VCC: u16 = 11;
    /// U1 pad 12 → Net-(U1-Pad10)
    pub const GND: u16 = 12;
    /// U1 pad 13 → Net-(U1-Pad13)
    pub const IFCLK: u16 = 13;
    /// U1 pad 14 → Net-(U1-Pad14)
    pub const RESERVED: u16 = 14;
    /// U1 pad 15 → Net-(U1-Pad15)
    pub const SCL: u16 = 15;
    /// U1 pad 16 → Net-(U1-Pad16)
    pub const SDA: u16 = 16;
    /// U1 pad 17 → Net-(U1-Pad11)
    pub const VCC_17: u16 = 17;
    /// U1 pad 18 → Net-(U1-Pad18)
    pub const PB0_FD0: u16 = 18;
    /// U1 pad 19 → Net-(U1-Pad19)
    pub const PB1_FD1: u16 = 19;
    /// U1 pad 20 → Net-(U1-Pad20)
    pub const PB2_FD2: u16 = 20;
    /// U1 pad 21 → Net-(U1-Pad21)
    pub const PB3_FD3: u16 = 21;
    /// U1 pad 22 → Net-(U1-Pad22)
    pub const PB4_FD4: u16 = 22;
    /// U1 pad 23 → Net-(U1-Pad23)
    pub const PB5_FD5: u16 = 23;
    /// U1 pad 24 → FPGA_DONE
    pub const PB6_FD6: u16 = 24;
    /// U1 pad 25 → Net-(U1-Pad25)
    pub const PB7_FD7: u16 = 25;
    /// U1 pad 26 → Net-(U1-Pad10)
    pub const GND_26: u16 = 26;
    /// U1 pad 27 → Net-(U1-Pad11)
    pub const VCC_27: u16 = 27;
    /// U1 pad 28 → Net-(U1-Pad10)
    pub const GND_28: u16 = 28;
    /// U1 pad 29 → LED_ERR
    pub const CTL0_FLAGA: u16 = 29;
    /// U1 pad 30 → LED_ACT
    pub const CTL1_FLAGB: u16 = 30;
    /// U1 pad 31 → LED_FPGA
    pub const CTL2_FLAGC: u16 = 31;
    /// U1 pad 32 → Net-(U1-Pad11)
    pub const VCC_32: u16 = 32;
    /// U1 pad 33 → Net-(U1-Pad33)
    pub const PA0_INT0: u16 = 33;
    /// U1 pad 34 → ENVA
    pub const PA1_INT1: u16 = 34;
    /// U1 pad 35 → Net-(U1-Pad35)
    pub const PA2_SLOE: u16 = 35;
    /// U1 pad 36 → Net-(U1-Pad36)
    pub const PA3_WU2: u16 = 36;
    /// U1 pad 37 → Net-(U1-Pad37)
    pub const PA4_FIOADDR0: u16 = 37;
    /// U1 pad 38 → Net-(U1-Pad38)
    pub const PA5_FIOADDR1: u16 = 38;
    /// U1 pad 39 → Net-(U1-Pad39)
    pub const PA6_PKTEND: u16 = 39;
    /// U1 pad 40 → Net-(U1-Pad40)
    pub const PA7_FLAGD_SLCS: u16 = 40;
    /// U1 pad 41 → Net-(U1-Pad10)
    pub const GND_41: u16 = 41;
    /// U1 pad 42 → Net-(U1-Pad42)
    pub const RESET: u16 = 42;
    /// U1 pad 43 → Net-(U1-Pad11)
    pub const VCC_43: u16 = 43;
    /// U1 pad 44 → Net-(U1-Pad44)
    pub const WAKEUP: u16 = 44;
    /// U1 pad 45 → ~{FPGA_RESET}
    pub const PD0_FD8: u16 = 45;
    /// U1 pad 46 → ~{ALERT}
    pub const PD1_FD9: u16 = 46;
    /// U1 pad 47 → Net-(U1-Pad47)
    pub const PD2_FD10: u16 = 47;
    /// U1 pad 48 → Net-(U1-Pad48)
    pub const PD3_FD11: u16 = 48;
    /// U1 pad 49 → Net-(U1-Pad49)
    pub const PD4_FD12: u16 = 49;
    /// U1 pad 50 → Net-(U1-Pad50)
    pub const PD5_FD13: u16 = 50;
    /// U1 pad 51 → Net-(U1-Pad51)
    pub const PD6_FD14: u16 = 51;
    /// U1 pad 52 → Net-(U1-Pad52)
    pub const PD7_FD15: u16 = 52;
    /// U1 pad 53 → Net-(U1-Pad10)
    pub const GND_53: u16 = 53;
    /// U1 pad 54 → Net-(U1-Pad54)
    pub const CLKOUT: u16 = 54;
    /// U1 pad 55 → Net-(U1-Pad11)
    pub const VCC_55: u16 = 55;
    /// U1 pad 56 → Net-(U1-Pad10)
    pub const GND_56: u16 = 56;
    /// U1 pad 57 → Net-(U1-Pad57)
    pub const EP: u16 = 57;
}

pub mod rails {
    // GNDPLL0: voltage unknown
    // GNDPLL1: voltage unknown
    // VCCPLL0: voltage unknown
    // VCCPLL1: voltage unknown
}

pub mod i2c {
    // U2: address unknown
    // U3: address unknown
    // U12: address unknown
    // U13: address unknown
    // U20: address unknown
    // U21: address unknown
}
