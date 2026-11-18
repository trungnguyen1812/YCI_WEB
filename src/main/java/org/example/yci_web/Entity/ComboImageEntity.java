package org.example.yci_web.Entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
@Entity
@Table(name = "combo_image")
public class ComboImageEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long idComboImage;

    @Lob
    @Column(name = "image", columnDefinition = "LONGBLOB")
    private byte[] image;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "id_combo")
    private ComboEntity comboEntity;
}
