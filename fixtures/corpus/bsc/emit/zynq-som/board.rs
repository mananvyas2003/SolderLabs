// * generated-by: @solderlab/bsc (rust)
// * board: zynq-som
// * source-revision: ad96951a225fbf9f263b555ef070a536b09ff710
// * bsc-schema-version: 1.0
// * source-sha256: 60e7f93961f901fb92c3a7fcd36ea09f0b5a118d4fb4292ab16b5c5f065f36d1
// * DO NOT EDIT

//! Board Support Contract — zynq-som
#![allow(non_upper_case_globals)]

pub const SOLDERLAB_BSC_VERSION: &str = "1.0";
pub const BOARD_NAME: &str = "zynq-som";

pub mod mcu {
    pub const REFDES: &str = "U9";
    pub const MPN: &str = "STM32G431CBUx";
}

pub mod pins {
    /// U9 pad 1 → Net-(U9-Pad1)
    pub const VBAT: u16 = 1;
    /// U9 pad 2 → STM32_USB_CC1
    pub const PC13: u16 = 2;
    /// U9 pad 3 → STM32_GPIO2
    pub const PC14: u16 = 3;
    /// U9 pad 4 → STM32_USB_CC2
    pub const PC15: u16 = 4;
    /// U9 pad 5 → ZYNQ_PS_SRST
    pub const PF0: u16 = 5;
    /// U9 pad 6 → ZYNQ_PS_POR
    pub const PF1: u16 = 6;
    /// U9 pad 7 → Net-(U9-Pad7)
    pub const PG10: u16 = 7;
    /// U9 pad 8 → Net-(U9-Pad8)
    pub const PA0: u16 = 8;
    /// U9 pad 9 → Net-(U9-Pad9)
    pub const PA1: u16 = 9;
    /// U9 pad 10 → Net-(U9-Pad10)
    pub const PA2: u16 = 10;
    /// U9 pad 11 → Net-(U9-Pad11)
    pub const PA3: u16 = 11;
    /// U9 pad 12 → Net-(U9-Pad12)
    pub const PA4: u16 = 12;
    /// U9 pad 13 → Net-(U9-Pad13)
    pub const PA5: u16 = 13;
    /// U9 pad 14 → Net-(U9-Pad14)
    pub const PA6: u16 = 14;
    /// U9 pad 15 → Net-(U9-Pad15)
    pub const PA7: u16 = 15;
    /// U9 pad 16 → STM32_GPIO7
    pub const PC4: u16 = 16;
    /// U9 pad 17 → ZYNQ_BMODE_0
    pub const PB0: u16 = 17;
    /// U9 pad 18 → SENSE_1V8
    pub const PB1: u16 = 18;
    /// U9 pad 19 → SENSE_1V35
    pub const PB2: u16 = 19;
    /// U9 pad 20 → Net-(U9-Pad20)
    pub const VREF: u16 = 20;
    /// U9 pad 21 → Net-(U9-Pad21)
    pub const VDDA: u16 = 21;
    /// U9 pad 22 → eMMC_~{RST}
    pub const PB10: u16 = 22;
    /// U9 pad 23 → Net-(U9-Pad23)
    pub const VDD: u16 = 23;
    /// U9 pad 24 → Net-(U9-Pad24)
    pub const PB11: u16 = 24;
    /// U9 pad 25 → 1V35_PG
    pub const PB12: u16 = 25;
    /// U9 pad 26 → 1V0_EN
    pub const PB13: u16 = 26;
    /// U9 pad 27 → Net-(U9-Pad27)
    pub const PB14: u16 = 27;
    /// U9 pad 28 → STM32_NRST
    pub const PB15: u16 = 28;
    /// U9 pad 29 → 1V8_EN
    pub const PC6: u16 = 29;
    /// U9 pad 30 → Net-(U9-Pad30)
    pub const PA8: u16 = 30;
    /// U9 pad 31 → Net-(U9-Pad31)
    pub const PA9: u16 = 31;
    /// U9 pad 32 → Net-(U9-Pad32)
    pub const PA10: u16 = 32;
    /// U9 pad 33 → Net-(U9-Pad33)
    pub const PA11: u16 = 33;
    /// U9 pad 34 → Net-(U9-Pad34)
    pub const PA12: u16 = 34;
    /// U9 pad 35 → Net-(U9-Pad35)
    pub const VDD_35: u16 = 35;
    /// U9 pad 36 → Net-(U9-Pad36)
    pub const PA13: u16 = 36;
    /// U9 pad 37 → Net-(U9-Pad37)
    pub const PA14: u16 = 37;
    /// U9 pad 38 → Net-(U9-Pad38)
    pub const PA15: u16 = 38;
    /// U9 pad 39 → STM32_BOOT0
    pub const PC10: u16 = 39;
    /// U9 pad 40 → Net-(U9-Pad40)
    pub const PC11: u16 = 40;
    /// U9 pad 41 → Net-(U9-Pad41)
    pub const PB3: u16 = 41;
    /// U9 pad 42 → 1V8_PG
    pub const PB4: u16 = 42;
    /// U9 pad 43 → 3V3_EN
    pub const PB5: u16 = 43;
    /// U9 pad 44 → 1V0_PG
    pub const PB6: u16 = 44;
    /// U9 pad 45 → STM32_GPIO1
    pub const PB7: u16 = 45;
    /// U9 pad 46 → STM32_GPIO3
    pub const PB8: u16 = 46;
    /// U9 pad 47 → USB_PHY_RST
    pub const PB9: u16 = 47;
    /// U9 pad 48 → Net-(U9-Pad48)
    pub const VDD_48: u16 = 48;
    /// U9 pad 49 → Net-(U9-Pad49)
    pub const VSS: u16 = 49;
}

pub mod rails {
    // N1V0_EN: voltage unknown
    // N1V0_ETH: voltage unknown
    // N1V0_PG: voltage unknown
    // N1V35_EN: voltage unknown
    // N1V35_PG: voltage unknown
    // N1V8_EN: voltage unknown
    // N1V8_PG: voltage unknown
    // N1V8A_ETH: voltage unknown
    // N3V3_EN: voltage unknown
    // N3V3_PG: voltage unknown
    // N3V3A_ETH: voltage unknown
    // VBUS_OUT_EN: voltage unknown
    // VCCADC: voltage unknown
    // VCCPLL: voltage unknown
}

pub mod i2c {
}
