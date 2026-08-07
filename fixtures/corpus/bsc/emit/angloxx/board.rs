// * generated-by: @solderlab/bsc (rust)
// * board: angloxx
// * source-revision: 4c0d316fb844ea3e6e4d162ae49918d5c09a722f
// * bsc-schema-version: 1.0
// * source-sha256: b397345d20e75b44a42312df288ff2c696ac7c6b8e6ef211cbf34cada13d51fa
// * DO NOT EDIT

//! Board Support Contract — angloxx
#![allow(non_upper_case_globals)]

pub const SOLDERLAB_BSC_VERSION: &str = "1.0";
pub const BOARD_NAME: &str = "angloxx";

pub mod mcu {
    pub const REFDES: &str = "STM55001";
    pub const MPN: &str = "STM32F103C8Tx";
}

pub mod pins {
    /// STM55001 pad 1 → Net-(STM55001-Pad1)
    pub const VBAT: u16 = 1;
    /// STM55001 pad 2 → I2C2_SCL
    pub const PC13: u16 = 2;
    /// STM55001 pad 3 → PB9
    pub const PC14: u16 = 3;
    /// STM55001 pad 4 → PB8
    pub const PC15: u16 = 4;
    /// STM55001 pad 5 → PB13
    pub const PD0: u16 = 5;
    /// STM55001 pad 6 → I2C2_SMBAI
    pub const PD1: u16 = 6;
    /// STM55001 pad 7 → Net-(STM55001-Pad7)
    pub const NRST: u16 = 7;
    /// STM55001 pad 8 → Net-(STM55001-Pad8)
    pub const VSSA: u16 = 8;
    /// STM55001 pad 9 → Net-(STM55001-Pad9)
    pub const VDDA: u16 = 9;
    /// STM55001 pad 10 → Net-(STM55001-Pad10)
    pub const PA0: u16 = 10;
    /// STM55001 pad 11 → Net-(STM55001-Pad11)
    pub const PA1: u16 = 11;
    /// STM55001 pad 12 → Net-(STM55001-Pad12)
    pub const PA2: u16 = 12;
    /// STM55001 pad 13 → Net-(STM55001-Pad13)
    pub const PA3: u16 = 13;
    /// STM55001 pad 14 → Net-(STM55001-Pad14)
    pub const PA4: u16 = 14;
    /// STM55001 pad 15 → Net-(STM55001-Pad15)
    pub const PA5: u16 = 15;
    /// STM55001 pad 16 → Net-(STM55001-Pad16)
    pub const PA6: u16 = 16;
    /// STM55001 pad 17 → Net-(STM55001-Pad17)
    pub const PA7: u16 = 17;
    /// STM55001 pad 18 → I2C1_SCL
    pub const PB0: u16 = 18;
    /// STM55001 pad 19 → I2C1_SMBAI
    pub const PB1: u16 = 19;
    /// STM55001 pad 20 → PB4
    pub const PB2: u16 = 20;
    /// STM55001 pad 21 → Net-(STM55001-Pad21)
    pub const PB10: u16 = 21;
    /// STM55001 pad 22 → Net-(STM55001-Pad22)
    pub const PB11: u16 = 22;
    /// STM55001 pad 23 → Net-(STM55001-Pad23)
    pub const VSS: u16 = 23;
    /// STM55001 pad 24 → Net-(#PWR055011-Pad1)
    pub const VDD: u16 = 24;
    /// STM55001 pad 25 → Net-(X55001-Pad3)
    pub const PB12: u16 = 25;
    /// STM55001 pad 26 → Net-(X55001-Pad1)
    pub const PB13: u16 = 26;
    /// STM55001 pad 27 → Net-(STM55001-Pad27)
    pub const PB14: u16 = 27;
    /// STM55001 pad 28 → BOOT0
    pub const PB15: u16 = 28;
    /// STM55001 pad 29 → Net-(STM55001-Pad29)
    pub const PA8: u16 = 29;
    /// STM55001 pad 30 → Net-(STM55001-Pad30)
    pub const PA9: u16 = 30;
    /// STM55001 pad 31 → Net-(STM55001-Pad31)
    pub const PA10: u16 = 31;
    /// STM55001 pad 32 → Net-(STM55001-Pad32)
    pub const PA11: u16 = 32;
    /// STM55001 pad 33 → Net-(STM55001-Pad33)
    pub const PA12: u16 = 33;
    /// STM55001 pad 34 → PA15
    pub const PA13: u16 = 34;
    /// STM55001 pad 35 → Net-(STM55001-Pad23)
    pub const VSS_35: u16 = 35;
    /// STM55001 pad 36 → Net-(STM55001-Pad36)
    pub const VDD_36: u16 = 36;
    /// STM55001 pad 37 → Net-(STM55001-Pad37)
    pub const PA14: u16 = 37;
    /// STM55001 pad 38 → Net-(STM55001-Pad38)
    pub const PA15: u16 = 38;
    /// STM55001 pad 39 → PB3
    pub const PB3: u16 = 39;
    /// STM55001 pad 40 → BOOT1
    pub const PB4: u16 = 40;
    /// STM55001 pad 41 → Net-(STM55001-Pad41)
    pub const PB5: u16 = 41;
    /// STM55001 pad 42 → Net-(STM55001-Pad42)
    pub const PB6: u16 = 42;
    /// STM55001 pad 43 → Net-(STM55001-Pad43)
    pub const PB7: u16 = 43;
    /// STM55001 pad 44 → PB15
    pub const BOOT0: u16 = 44;
    /// STM55001 pad 45 → Net-(STM55001-Pad45)
    pub const PB8: u16 = 45;
    /// STM55001 pad 46 → Net-(STM55001-Pad46)
    pub const PB9: u16 = 46;
    /// STM55001 pad 47 → Net-(STM55001-Pad23)
    pub const VSS_47: u16 = 47;
    /// STM55001 pad 48 → Net-(STM55001-Pad48)
    pub const VDD_48: u16 = 48;
}

pub mod rails {
    // VBUS: voltage unknown
}

pub mod i2c {
    // J60003: address unknown
}
